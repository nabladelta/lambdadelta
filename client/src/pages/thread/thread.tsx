import React, {useEffect, useState} from 'react'
import {
  VStack,
  Link as CLink,
  HStack,
  IconButton,
  Tooltip,
  Text,
  useDisclosure
} from "@chakra-ui/react"
import { ArrowBackIcon, ArrowDownIcon, ArrowUpIcon, RepeatClockIcon, ChatIcon } from '@chakra-ui/icons'
import Post from '../../components/Post'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import Reply from '../../components/Reply'
import { buttonStyle } from '../board/catalog'
import { fetchThread, postReply } from '../../app/posts'

function isGreentext(line: string) {
  line = line.trim()
  if (line[0] == '>' && line[1] != '>') return true

  return false
}

function handleQuoteLinks(line: string, quoteCallback: (quoteRef: string) => IPost | false) {
  const firstLink = line.indexOf('>>')
  if (firstLink == -1) return line
  return <>{line.split('>>').map((quoteText, i) => {
    // Handle special case of first text section, which might not have a quotelink
    if (firstLink != 0 && i == 0) return <React.Fragment key={i}>{quoteText}</React.Fragment>
    if (!quoteText || !quoteText.length) return
    const firstSpace = quoteText.indexOf(' ')
    // No space means there is no text
    const quoteRef = firstSpace != -1 ? quoteText.slice(0, firstSpace) : quoteText
    const text = firstSpace != -1 ? quoteText.slice(firstSpace) : undefined
    const res = quoteCallback(quoteRef)
    if (res) {
      // Valid quotelink, create the corresponding element
      return <React.Fragment key={i}><CLink textDecoration={'underline'} color={'red.500'} href={`#p${quoteRef}`}>&gt;&gt;{quoteRef}</CLink>{text && <Text as='span'>{' '+text}</Text>}</React.Fragment>
    } else {
      // We restore whatever this was
      return <React.Fragment key={i}>{'>>'+quoteText}</React.Fragment>
    }
  })}</>
}

function handleLine(line: string, i: number, quoteCallback: (quoteRef: string) => IPost | false) {
  if (isGreentext(line)) {
    return <React.Fragment key={i}>
        <Text as='span' key={i} color={isGreentext(line) ? 'green.300' : undefined}>{handleQuoteLinks(line, quoteCallback)}</Text><br/>
      </React.Fragment>
  }
  return <React.Fragment key={i}>{handleQuoteLinks(line, quoteCallback)}<br/></React.Fragment>
}

export function processComs(thread: IThread) {
  const processed: IProcessedThread = {replies: {}, posts: [], postsByRef: {}}
  for (let post of thread.posts) {
    processed.postsByRef[post.no.slice(-16)] = post
  }
  const quoteCallback = (post: IPost, quoteRef: string) => {
    if (!processed.replies[quoteRef]) processed.replies[quoteRef] = new Set<IPost>
    // Doesn't look like a quoteref (will need to do more verification here eventually)
    if (quoteRef.length != 16) return false
    processed.replies[quoteRef].add(post)
    return processed.postsByRef[quoteRef]
  }
  for (let post of thread.posts) {
      post.parsedCom = (
      <Text align={'left'} py='2'>
        {post.com.split('\n').map((line, i) => {
          return handleLine(line, i, (quoteRef: string) => quoteCallback(post, quoteRef))
        })}
      </Text>)
      processed.posts.push(post)
  }
  return processed
}

function ThreadPage() {
  const toast = useToast()
  const [data, setData] = useState<IProcessedThread>({posts: [], replies: {}, postsByRef: {}})
  const { board, id } = useParams()

  async function updateData() {
    try {
      const response = await fetchThread(board!, id!)
      setData(processComs(response))
      toast({
        title: 'Posts Updated',
        status: 'success',
        duration: 1500,
      })
    } catch (e) {
      toast({
        title: (e as Error).message,
        status: 'error',
        duration: 2000,
      })
    }
  }

  useEffect(() => {
    updateData()
  }, [board, id])

  async function post(postData: {post: IPost, attachments: IFileData[]}) {
    try {
      const response = await postReply(board!, id!, postData)
      toast({
        title: 'Post Successful',
        status: 'success',
        duration: 1500,
      })
      setData(processComs(response))
      onClose()
    } catch (e) {
      toast({
        title: (e as Error).message,
        status: 'error',
        duration: 2000,
      })
    }
  }

  const { isOpen, onOpen, onClose } = useDisclosure()

  const [highlight, setHighlight] = useState<string | undefined>()
  return (
    <VStack align="flex-start" spacing={8} marginBottom={isOpen ? 400 : 0}>
    <HStack id={'top'} spacing={6}>
      <Tooltip label='Return'>
        <Link to={`/${board}/catalog`} ><IconButton aria-label='Return' icon={<ArrowBackIcon />} {...buttonStyle}/></Link>
      </Tooltip>
      <Tooltip label='Bottom'>
        <CLink href="#bottom" _hover={{ textDecoration: "none" }}>
          <IconButton aria-label='Bottom' icon={<ArrowDownIcon />} {...buttonStyle} />
        </CLink>
      </Tooltip>
      <Tooltip label='Update'>
        <IconButton aria-label='Update' icon={<RepeatClockIcon />} {...buttonStyle} onClick={updateData} />
      </Tooltip>
      <Tooltip label='Reply'>
        <IconButton aria-label='Reply' icon={<ChatIcon />} {...buttonStyle} onClick={onOpen} />
      </Tooltip>
    </HStack>
    <VStack align="flex-start" spacing={8}>
      {data.posts.map(p => <Post key={p.no} post={p as any} replies={data.replies[p.no.slice(-16)]} highlight={highlight} setHighlight={setHighlight}/>)}
    </VStack>
    <HStack id={'bottom'} spacing={6}>
      <Tooltip label='Return'>
          <Link to={`/${board}/catalog`} ><IconButton aria-label='Return' icon={<ArrowBackIcon />} {...buttonStyle}/></Link>
        </Tooltip>
        <Tooltip label='Top'>
          <CLink href="#top" _hover={{ textDecoration: "none" }}>
            <IconButton aria-label='Top' icon={<ArrowUpIcon />} {...buttonStyle} />
          </CLink>
        </Tooltip>
        <Tooltip label='Update'>
          <IconButton aria-label='Update' icon={<RepeatClockIcon />} {...buttonStyle} onClick={updateData} />
        </Tooltip>
        <Tooltip label='Reply'>
          <IconButton aria-label='Reply' icon={<ChatIcon />} {...buttonStyle} onClick={onOpen} />
        </Tooltip>
    </HStack>
    <Reply isOpen={isOpen} onClose={onClose} onPost={post} />
    </VStack>
  )
}

export default ThreadPage
