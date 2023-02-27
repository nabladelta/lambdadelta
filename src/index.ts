import express, { Express, Request, Response } from 'express'
import dotenv from 'dotenv'
import { BulletinBoard } from './core/board'

dotenv.config()

const app: Express = express()
const port = process.env.PORT
const topic = process.env.TOPIC!
const client = new BulletinBoard(process.env.SECRET!, topic, process.env.MEMSTORE == 'true')

client.newThread().then(threadId => {
  client.newMessage(threadId, "I am NUMBER ONE")
  client.newMessage(threadId, "I am NUMBER TWO")
})

app.use(express.json())

app.get('/:topic/thread/:id', async (req: Request, res: Response) => {
    const thread = await client.getThreadContent(req.params.id)
    res.send({posts: thread})
})

app.put('/:topic/thread/:id', async (req: Request, res: Response) => {
    await client.newMessage(req.params.id, req.body)
    const thread = await client.getThreadContent(req.params.id)
    res.send(thread.toString())
})
app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
})