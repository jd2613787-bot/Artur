import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import qrcode from 'qrcode-terminal'

const adapter = new JSONFile('db.json')
const defaultData = { usuarios: {}, tienda: [], creador: "" }
const db = new Low(adapter, defaultData)

await db.read()

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ 
        auth: state,
        printQRInTerminal: true, 
        browser: ['Artur', 'Chrome', '1.0.0'] 
    })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if(qr) {
            console.log("Escanea este QR con WhatsApp > Dispositivos Vinculados")
            qrcode.generate(qr, {small: true})
        }
        if(connection === 'close') {
            if((lastDisconnect.error)?.output?.statusCode!== DisconnectReason.loggedOut) startBot()
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
            let item = db.data.tienda.find(i => i.id === id)
            if(!item) return sock.sendMessage(chat, {text: "Artur: Item no existe"})
            if(user.puntos < item.precio) return sock.sendMessage(chat, {text: `Artur: No te alcanza. Necesitas ${item.precio} Aureos`})
            user.puntos -= item.precio
            sock.sendMessage(chat, {text: `✅ Artur: Compraste ${item.nombre} por ${item.precio} Aureos.\nTe quedan ${user.puntos} Aureos`})
        }

        if(comando === 'pagar'){
            if(!esAdmin) return
            let target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            let monto = parseInt(args[1])
            let motivo = args.slice(2).join(" ") || "Trabajo"
            if(!target ||!monto) return sock.sendMessage(chat, {text: "Artur: Uso!pagar @user 100 motivo"})
            db.data.usuarios[target] ||= { puntos: 0, ultimoDaily: 0 }
            db.data.usuarios[target].puntos += monto
            sock.sendMessage(chat, {text: `💼 Artur: @${target.split('@')[0]} recibió ${monto} Aureos por: ${motivo}`, mentions: [target]})
        }

        if(comando === 'agregaritem'){
            if(!esAdmin) return
            let precio = parseInt(args.pop())
            let nombre = args.join(" ")
            let id = db.data.tienda.length + 1
            db.data.tienda.push({id, nombre, precio})
            sock.sendMessage(chat, {text: `✅ Artur: Item agregado: ${nombre} - ${precio} Aureos`})
        }

        if(comando === 'borraritem'){
            if(!esAdmin) return
            let id = parseInt(args[0])
            db.data.tienda = db.data.tienda.filter(i => i.id!== id)
            sock.sendMessage(chat, {text: `🗑️ Artur: Item ${id} borrado`})
        }

        if(comando === 'top'){
            if(sender!== db.data.creador) return sock.sendMessage(chat, {text: "🔒 Artur: Solo el creador puede ver el ranking completo"})
            let ranking = Object.entries(db.data.usuarios).sort((a,b) => b[1].puntos - a[1].puntos).slice(0,10)
            let texto = "🏆 RANKING SECRETO DE ARTUR:\n" + ranking.map((u,i) => `${i+1}. @${u[0].split('@')[0]} - ${u[1].puntos} Aureos`).join('\n')
            sock.sendMessage(chat, {text: texto, mentions: ranking.map(u => u[0])})
        }

        await db.write()
    })
}

startBot()
