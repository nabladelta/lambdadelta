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

app.use(express.json({limit: '50mb'}))
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

async function processAttachment(fileData: IFileData, post: IPost, tid: string) {
  const buf = Buffer.from(fileData.data.split('base64,')[1], 'base64')
  const id = await node.filestore.store(tid, buf)
  console.log(id)
  const [filename, ext] = fileData.filename.split('.')
  post.filename = filename
  post.ext = '.' + ext
  post.fsize = buf.length
  post.tim = id.cid + '-' + id.blobId.byteOffset.toString(16) + '-' + id.blobId.blockOffset.toString(16) + '-' + id.blobId.blockLength.toString(16) + '-' + id.blobId.byteLength.toString(16)
  post.mime = fileData.type
}

async function parseFileID(fileID: string) {
  const id = fileID.split('.')[0]
  const [cid, byteOffset, blockOffset, blockLength, byteLength] = id.split('-')
  return {cid, blobId: {
    byteOffset: parseInt(byteOffset, 16), 
    blockOffset: parseInt(blockOffset, 16),
    blockLength: parseInt(blockLength, 16), 
    byteLength: parseInt(byteLength, 16)
  }}
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
  const splitid = req.params.id.split('.')

  if (splitid.length > 1) {
    const ext = splitid[1]
    console.log(ext)
    res.contentType(ext)
  }

  const id = await parseFileID(req.params.id)
  const content = await node.filestore.retrieve(id.cid, id.blobId)
  res.send(content)
})

app.post('/api/:topic/thread/:id.json', async (req: Request, res: Response) => {
    const client = node.boards.get(req.params.topic)
    if (!client) return NotFoundError(res)
    const post: IPost = req.body.post

    if (req.body.attachments && req.body.attachments[0]) {
      await processAttachment(req.body.attachments[0], post, req.params.id)
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

  if (req.body.attachments && req.body.attachments[0]) {
    await processAttachment(req.body.attachments[0], post, req.params.id)
  }

  const threadId = await client.newThread(post)
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