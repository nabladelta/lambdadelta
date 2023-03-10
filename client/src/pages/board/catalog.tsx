import React, {useEffect, useState} from 'react'
import {
  ChakraProvider,
  Box,
  Text,
  VStack,
  Code,
  Grid,
  Card,
  Image,
  Stack,
  Heading,
  Button,
  Flex,
  LinkBox,
  Link as CLink,
  SimpleGrid,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure
} from "@chakra-ui/react"
import { ArrowBackIcon, ArrowDownIcon, ArrowUpIcon, RepeatClockIcon, ChatIcon } from '@chakra-ui/icons'
import Post from '../../components/Post'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import Reply from '../../components/Reply'
import { API_URL } from '../../constants'

export const buttonStyle = { variant:'outline', colorScheme:'gray', fontSize:'20px' }

function Catalog() {
  const toast = useToast()
  const { board } = useParams()
  const [data, setData] = useState<ICatalogPage[]>([])
  const navigate = useNavigate()

  async function updateData() {
    const r = await fetch(`${API_URL}/${board}/catalog`)
    setData(await r.json())
    toast({
      title: 'Threads Updated',
      status: 'success',
      duration: 1500,
    })
  }
  useEffect(() => {
    updateData()
  }, [board])

  async function post({post, attachments}: {post: IPost, attachments: IFileData[]}) {
    const r = await fetch(`${API_URL}/${board}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({post, attachments})
    })
    const content = await r.json()
    console.log(content)
    navigate(`/${board}/thread/${content.op}`)
    toast({
      title: 'New Thread Created',
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
        <Link to="/" ><IconButton aria-label='Return' icon={<ArrowBackIcon />} {...buttonStyle}/></Link>
      </Tooltip>
      <Tooltip label='Bottom'>
        <CLink href="#bottom" _hover={{ textDecoration: "none" }}>
          <IconButton aria-label='Bottom' icon={<ArrowDownIcon />} {...buttonStyle} />
        </CLink>
      </Tooltip>
      <Tooltip label='Update'>
        <IconButton aria-label='Update' icon={<RepeatClockIcon />} {...buttonStyle} onClick={updateData} />
      </Tooltip>
      <Tooltip label='New Thread'>
        <IconButton aria-label='New Thread' icon={<ChatIcon />} {...buttonStyle} onClick={onOpen} />
      </Tooltip>
    </HStack>
    <SimpleGrid minChildWidth='lg' spacing='40px' >
      {data.map(page => 
          page.threads.map(p => 
          <Link key={p.no} to={`/${board}/thread/${p.no.split('>')[0]}`}><Post post={p} vertical={true} /></Link> 
      ))}
    </SimpleGrid>
    <HStack id={'bottom'} spacing={6}>
      <Tooltip label='Return'>
        <Link to="/" ><IconButton aria-label='Return' icon={<ArrowBackIcon />} {...buttonStyle}/></Link>
      </Tooltip>
      <Tooltip label='Top'>
        <CLink href="#top" _hover={{ textDecoration: "none" }}>
          <IconButton aria-label='Top' icon={<ArrowUpIcon />} {...buttonStyle} />
        </CLink>
      </Tooltip>
      <Tooltip label='Update'>
        <IconButton aria-label='Update' icon={<RepeatClockIcon />} {...buttonStyle} onClick={updateData} />
      </Tooltip>
      <Tooltip label='New Thread'>
        <IconButton aria-label='New Thread' icon={<ChatIcon />} {...buttonStyle} onClick={onOpen} />
      </Tooltip>
    </HStack>
    <Reply op={true} isOpen={isOpen} onClose={onClose} onPost={post} />
    </VStack>
  );
}

export default Catalog;
