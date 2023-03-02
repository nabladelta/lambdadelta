import express, { Express, Request, Response } from 'express'
import dotenv from 'dotenv'
import { BulletinBoard } from './core/board'
import path from 'path'

dotenv.config()

const app: Express = express()
const port = process.env.PORT
const topic = process.env.TOPIC!
const client = new BulletinBoard(process.env.SECRET!, topic, process.env.MEMSTORE == 'true')

app.use(express.json())

app.get('/api/:topic/thread/:id', async (req: Request, res: Response) => {
    const thread = await client.getThreadContent(req.params.id)
    res.send({posts: thread})
})

app.post('/api/:topic/thread/:id', async (req: Request, res: Response) => {
    await client.newMessage(req.params.id, req.body)
    const thread = await client.getThreadContent(req.params.id)
    res.send(thread)
})

app.post('/api/:topic', async (req: Request, res: Response) => {
  const threadId = await client.newThread()
  await client.newMessage(threadId, req.body)
  const thread = await client.getThreadContent(threadId)
  res.send({op: threadId, thread: thread})
})

app.get('/api/:topic', async (req: Request, res: Response) => {
  const threads = client.getThreadList()
  res.send({threads})
})

app.get('/*', function (req, res) {
   res.sendFile(path.join('../client', 'build', 'index.html'));
 });

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
})