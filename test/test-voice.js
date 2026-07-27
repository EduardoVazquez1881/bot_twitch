import express from 'express'
import { main, leerAudio, eliminar } from '../src/voz.js'

const app = express()
const port = 3000

console.log('Iniciando servidor')

async function prueba() {
    await main('hola', 'es-MX-JorgeNeural', 'es-MX')
    await leerAudio()
    await eliminar()
    console.log('Audio generado exitosamente')
}

prueba()
