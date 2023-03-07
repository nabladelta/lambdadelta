import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { BBNode } from './core/node'

dotenv.config()

const port = process.env.PORT
const topic = process.env.TOPIC!

const node = new BBNode(process.env.SECRET!, process.env.MEMSTORE == 'true')
node.ready().then(()=> node.join(topic))

const app: Express = express()

app.use(express.json())
app.use(cors())

function NotFoundError(res: express.Response) {
  res.status(404)
  res.send({error: "Not Found"})
}

function AlreadyPresentError(res: express.Response) {
  res.status(409)
  res.send({error: "Thread Already Exists"})
}

app.get('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const client = node.boards.get(req.params.topic)
    if (!client) return NotFoundError(res)

    const thread = await client.getThreadContent(req.params.id)
    if (!thread) return NotFoundError(res)
    res.send(thread)
})

app.post('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const client = node.boards.get(req.params.topic)
    if (!client) return NotFoundError(res)

    await client.newMessage(req.params.id, req.body)
    const thread = await client.getThreadContent(req.params.id)
    res.send({success: true, posts: thread!.posts})
})

app.post('/api/:topic', async (req: Request, res: Response) => {
  const client = node.boards.get(req.params.topic)
  if (!client) return NotFoundError(res)

  const threadId = await client.newThread(req.body)
  if (!threadId) return AlreadyPresentError(res)

  const thread = await client.getThreadContent(threadId)
  res.send({success: true, op: threadId, thread: thread})
})

app.get('/api/:topic/catalog.json', async (req: Request, res: Response) => {
  const client = node.boards.get(req.params.topic)
  if (!client) return NotFoundError(res)

  const catalog = await client.getCatalog()
  res.send(catalog)
})

// app.get('/*', function (req, res) {
//    res.sendFile(path.join('../client', 'build', 'index.html'));
//  })

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
})