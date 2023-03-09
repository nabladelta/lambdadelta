import express, { Express, Request, Response } from 'express'
import crypto from 'crypto'
import cors from 'cors'
import dotenv from 'dotenv'
import { BBNode } from './core/node'
import { fileExists, makeThumbnail, parseFileID, processAttachment } from './lib'
import path from 'path'
import fs from 'fs'

dotenv.config()

const port = process.env.PORT
const topic = process.env.TOPIC!

const node = new BBNode(process.env.SECRET!, process.env.MEMSTORE == 'true')
node.ready().then(()=> node.join(topic))

const app: Express = express()

app.use(express.json({limit: '6mb'}))
app.use(cors())

function NotFoundError(res: express.Response) {
  res.status(404)
  res.send({error: "Not Found"})
}

function AlreadyPresentError(res: express.Response) {
  res.status(409)
  res.send({error: "Thread Already Exists"})
}

function FailedPost(res: express.Response) {
  res.status(409)
  res.send({error: "Failed to post"})
}

app.get('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const client = node.boards.get(req.params.topic)
    if (!client) return NotFoundError(res)

    const thread = await client.getThreadContent(req.params.id)
    if (!thread) return NotFoundError(res)
    res.send(thread)
})

app.get('/api/:topic/catalog.json', async (req: Request, res: Response) => {
  const client = node.boards.get(req.params.topic)
  if (!client) return NotFoundError(res)

  const catalog = await client.getCatalog()
  res.send(catalog)
})

app.get('/api/file/:id', async (req: Request, res: Response) => {
  const id = parseFileID(req.params.id)
  const content = await node.filestore.retrieve(id.cid, id.blobId)

  if (!content) return NotFoundError(res)

  if (content.mime && content.mime.length > 0) {
    res.contentType(content.mime)
  } else { // Fall back to extension in url if mime type is not set
    const [_, ext] = req.params.id.split('.', 2)

    if (ext) res.contentType(ext)
  }
  res.send(content.data)
})

app.get('/api/thumb/:id.jpg', async (req: Request, res: Response) => {
  

  const dir = path.join(process.cwd(), 'data', 'thumbs')
  if (!await fileExists(dir)) {
    fs.mkdirSync(dir)
  }

  const filename = path.join(dir, `${req.params.id}.jpg`)

  const options = {
    root: dir,
    dotfiles: 'deny',
    headers: {}
  }

  if (!await fileExists(filename)) {
    const result = await makeThumbnail(node.filestore, req.params.id, filename)

    if (!result) return NotFoundError(res)
    console.log("Generated thumbnail for ", req.params.id)
  }
  
  res.sendFile(`${req.params.id}.jpg`, options, (e) => {
    if (e) console.log(e)
  })
  
})

app.post('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const client = node.boards.get(req.params.topic)
    if (!client) return NotFoundError(res)
    const post: IPost = req.body.post

    if (req.body.attachments && req.body.attachments[0]) {
      await processAttachment(node.filestore, req.body.attachments[0], post, req.params.id)
    }
    const core = await client.newMessage(req.params.id, post)

    if (!core) return FailedPost(res)

    const thread = await client.getThreadContent(req.params.id)
    res.send({success: true, posts: thread!.posts})
})

app.post('/api/:topic', async (req: Request, res: Response) => {
  const client = node.boards.get(req.params.topic)
  if (!client) return NotFoundError(res)
  const post: IPost = req.body.post

  const threadId = await client.newThread(async (tid) => {
    if (req.body.attachments && req.body.attachments[0]) {
      return await processAttachment(node.filestore, req.body.attachments[0], post, tid)
    }
    return post
  })
  if (!threadId) return AlreadyPresentError(res)

  const thread = await client.getThreadContent(threadId)
  res.send({success: true, op: threadId, thread: thread})
})

// app.get('/*', function (req, res) {
//    res.sendFile(path.join('../client', 'build', 'index.html'));
//  })

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`)
})