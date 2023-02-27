import express, { Express, Request, Response } from 'express'
import dotenv from 'dotenv'
import { BulletinBoard } from './core/board'

dotenv.config()

const app: Express = express()
const port = process.env.PORT

const client = new BulletinBoard(process.env.SECRET!, process.env.TOPIC!, process.env.MEMSTORE == 'true')

client.newThread().then(threadId => client.newMessage(threadId, "I am NUMBER ONE"))


app.get('/thread/:id', async (req: Request, res: Response) => {
    const thread = await client.getThreadCausalStream(req.params.id)
    res.send(thread.toString())
})

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
})