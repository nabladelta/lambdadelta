import React, {useEffect, useState} from 'react'
import {
  VStack,
  Link as CLink,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure
} from "@chakra-ui/react"
import { ArrowBackIcon, ArrowDownIcon, ArrowUpIcon, RepeatClockIcon, ChatIcon } from '@chakra-ui/icons'
import Post from '../../components/Post'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import Reply from '../../components/Reply'
import { buttonStyle } from '../board/catalog'

function ThreadPage() {
  const toast = useToast()
  const [data, setData] = useState<IThread>({posts: []})
  const { board, id } = useParams()

  async function updateData() {
    const r = await fetch(`http://localhost:8089/api/a/thread/${id}.json`)
    if (!r.ok) {
      const emsg: {error: string} = await r.json()
      toast({
        title: emsg.error,
        status: 'error',
        duration: 2000,
      })
      return
    }
    setData(await r.json())
    toast({
      title: 'Posts Updated',
      status: 'success',
      duration: 1500,
    })
  }

  useEffect(() => {
    updateData()
  }, [board, id])

  async function post(post: IPost) {
    post.resto = id
    const r = await fetch(`http://localhost:8089/api/a/thread/${id}.json` , {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(post)
    })
    const content = await r.json()
    if (!r.ok) {
      toast({
        title: "Error Posting",
        status: 'error',
        duration: 2000,
      })
      return
    }
    console.log(content)
    setData(content)
    toast({
      title: "Post Successful",
      status: 'success',
      duration: 1500,
    })
    onClose()
  }

  const { isOpen, onOpen, onClose } = useDisclosure()
  return (
    <VStack align="flex-start" spacing={8}>
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
      {data.posts.map(p => <Post key={p.no} post={p as any}/>)} 
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
