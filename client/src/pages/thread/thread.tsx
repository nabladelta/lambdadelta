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
import Post, { ReplyLink } from '../../components/Post'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import Reply from '../../components/Reply'
import { buttonStyle } from '../board/catalog'
import { fetchThread, postReply } from '../../app/posts'
import { processComs } from '../../components/comParser'
import { truncateText } from '../../utils/utils'


export const HighlightContext = React.createContext<React.Dispatch<React.SetStateAction<string | undefined>> | undefined>(undefined);


function ThreadPage() {
  const toast = useToast()
  const [data, setData] = useState<IProcessedThread>({posts: [], replies: {}, postsByRef: {}})
  const { board, id } = useParams()

  async function updateData() {
    try {
      const response = await fetchThread(board!, id!)
      setData(processComs(response))
      document.title = `/${board}/ - ${(truncateText(response.posts[0].sub, 30) || truncateText(response.posts[0].com, 30))} - BBS`
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
      return true
    } catch (e) {
      toast({
        title: (e as Error).message,
        status: 'error',
        duration: 2000,
      })
      return false
    }
  }

  const { isOpen, onOpen, onClose } = useDisclosure()

  const [highlight, setHighlight] = useState<string | undefined>()
  const [quote, setQuote] = useState<(no: string) => void>()
  return (
    <VStack align="flex-start" spacing={8} marginBottom={isOpen ? 450 : 0}>
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
    <HighlightContext.Provider value={setHighlight}>
    <VStack align="flex-start" spacing={8}>
      {data.posts.map(p => <Post key={p.no} post={p as any} replies={data.replies[p.no]} highlight={highlight} quote={quote} />)}
    </VStack>
    </HighlightContext.Provider>
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
    <Reply isOpen={isOpen} onClose={onClose} onOpen={onOpen} onPost={post} setQuote={setQuote} />
    </VStack>
  )
}

export default ThreadPage
