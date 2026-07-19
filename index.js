import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const adapter = new JSONFile('db.json')
const defaultData = { usuarios: {}, tienda: [], creador: "" }
const db = new Low(adapter, defaultData)

await db.read()

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ 
        auth: state,
        printQRInTerminal: false, 
        browser: ['Artur', 'Chrome', '1.0.0'] 
    })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if(qr) {
            console.log("\n\n========== COPIA ESTE CODIGO Y HAZ UN QR ==========\n")
            console.log(qr)
            console.log("\nVe a https://www.qr-code-generator.com/ > pega > Create QR > Escanea\n")
            console.log("========== COPIA ESTE CODIGO Y HAZ UN QR ==========\n\n")
        }
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode!== DisconnectReason.loggedOut
            if(shouldReconnect) {
                console.log("Reconectando...")
                startBot()
            }
        }
        if(connection === 'open') {
            console.log("Artur conectado ✅")
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if(!msg.message || msg.key.fromMe) return

        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text
        const chat = msg.key.remoteJid
        const sender = msg.key.participant || msg.key.remoteJid

        if(chat.endsWith('@g.us') &&!db.data.creador){
            const group = await sock.groupMetadata(chat)
            db.data.creador = group.owner || sender
        }

        if(!texto?.startsWith('!')) return
        const args = texto.slice(1).trim().split(/ +/)
        const comando = args.shift().toLowerCase()

        let esAdmin = false
        if(chat.endsWith('@g.us')){
            const group = await sock.groupMetadata(chat)
            esAdmin = group.participants.find(p => p.id === sender)?.admin
        }

        db.data.usuarios[sender] ||= { puntos: 0, ultimoDaily: 0 }
        let user = db.data.usuarios[sender]

        if(comando === 'daily'){
            let ahora = Date.now()
            if(ahora - user.ultimoDaily < 86400000) return sock.sendMessage(chat, {text: "⏰ Ya cobraste tus 50 Aureos hoy. Volvé mañana"})
            user.puntos += 50
            user.ultimoDaily = ahora
            sock.sendMessage(chat, {text: `💰 Artur: +50 Aureos cobrados! Total: ${user.puntos} Aureos`})
        }

        if(comando === 'puntos'){
            let target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender
            sock.sendMessage(chat, {text: `Artur: @${target.split('@')[0]} tiene ${db.data.usuarios[target]?.puntos || 0} Aureos`, mentions: [target]})
        }

        if(comando === 'tienda'){
            if(db.data.tienda.length === 0) return sock.sendMessage(chat, {text: "Artur: La tienda está vacía. Que un admin agregue cosas"})
            let lista = db.data.tienda.map(i => `${i.id}. ${i.nombre} - ${i.precio} Aureos`).join('\n')
            sock.sendMessage(chat, {text: `🏪 Artur TIENDA:\n${lista}\nUsa!comprar [id]`})
        }

        if(comando === 'comprar'){
            let id = parseInt(args[0])
            let item = db.data.tienda.find(i => i
