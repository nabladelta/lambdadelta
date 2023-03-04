import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { BulletinBoard } from './core/board'
import path from 'path'

dotenv.config()

const port = process.env.PORT
const topic = process.env.TOPIC!

const clients = {
  [topic]: new BulletinBoard(process.env.SECRET!, topic, process.env.MEMSTORE == 'true')
}

const app: Express = express()

app.use(express.json())
app.use(cors())

app.get('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const thread = await clients[req.params.topic].getThreadContent(req.params.id)
    if (!thread) {
      res.status(404)
      res.send({error: "Not Found"})
      return
    }
    res.send(thread)
})

app.post('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const client = clients[req.params.topic]
    await client.newMessage(req.params.id, req.body)
    const thread = await client.getThreadContent(req.params.id)
    res.send({success: true, posts: thread!.posts})
})

app.post('/api/:topic', async (req: Request, res: Response) => {
  const client = clients[req.params.topic]

  const threadId = await client.newThread()
  await client.newMessage(threadId, req.body)
  const thread = await client.getThreadContent(threadId)
  res.send({success: true, op: threadId, thread: thread})
})

app.get('/api/:topic/catalog.json', async (req: Request, res: Response) => {
  const client = clients[req.params.topic]

  const catalog = await client.getCatalog()
  res.send(catalog)
})

// app.get('/*', function (req, res) {
//    res.sendFile(path.join('../client', 'build', 'index.html'));
//  })

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
})