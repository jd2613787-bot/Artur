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
            if(shouldReconnect) startBot()
        }
        if(connection === 'open') console.log("Artur conectado ✅")
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

        db.data.usuarios[sender] ||= { puntos: 0, ultimoDaily: 0
