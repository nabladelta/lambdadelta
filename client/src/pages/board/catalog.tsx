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
  Link as CLink,
  SimpleGrid,
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

function Catalog() {
  const toast = useToast()
  const { board } = useParams()
  const [data, setData] = useState<{page: number, threads: any[]}[]>([])

  async function updateData() {
    const r = await fetch('/catalog.json')
    setData(await r.json())
    toast({
      title: 'Threads Updated',
      status: 'success',
      duration: 1500,
    })
  }
  useEffect(() => {
    updateData()
  }, [])

  async function post(post: IPost) {
    const r = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(post)
    })
    const content = await r.json()
    console.log(content)
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
      <Link to="/" >
        <IconButton
          variant='outline'
          colorScheme='gray'
          aria-label='Return'
          fontSize='20px'
          icon={<ArrowBackIcon />}
        />
        </Link>
      </Tooltip>
      <Tooltip label='Bottom'>
      <CLink href="#bottom" _hover={{ textDecoration: "none" }}>
        <IconButton
          variant='outline'
          colorScheme='gray'
          aria-label='Bottom'
          fontSize='20px'
          icon={<ArrowDownIcon />}
        />
      </CLink>
      </Tooltip>
      <Tooltip label='Update'>
        <IconButton
          variant='outline'
          colorScheme='gray'
          aria-label='Update'
          fontSize='20px'
          onClick={updateData}
          icon={<RepeatClockIcon />}
        />
      </Tooltip>
      <Tooltip label='New Thread'>
      <IconButton
        variant='outline'
        colorScheme='gray'
        aria-label='New Thread'
        fontSize='20px'
        onClick={onOpen}
        icon={<ChatIcon />}
      />
      </Tooltip>
    </HStack>
    <SimpleGrid minChildWidth='lg' spacing='40px' >
      {data.map(page => page.threads
        .map(p => <Post key={p.no} post={p as any} vertical={true} />))}
    </SimpleGrid>
    <HStack id={'bottom'} spacing={6}>
      <Tooltip label='Return'>
        <Link to="/" >
        <IconButton
          variant='outline'
          colorScheme='gray'
          aria-label='Return'
          fontSize='20px'
          icon={<ArrowBackIcon />}
        />
        </Link>
      </Tooltip>
      <Tooltip label='Top'>
      <CLink href="#top" _hover={{ textDecoration: "none" }}>
        <IconButton
          variant='outline'
          colorScheme='gray'
          aria-label='Top'
          fontSize='20px'
          icon={<ArrowUpIcon />}
        />
      </CLink>
      </Tooltip>
      <Tooltip label='Update'>
      <IconButton
        variant='outline'
        colorScheme='gray'
        aria-label='Bottom'
        fontSize='20px'
        onClick={updateData}
        icon={<RepeatClockIcon />}
      />
      </Tooltip>
      <Tooltip label='Reply'>
      <IconButton
        variant='outline'
        colorScheme='gray'
        aria-label='Reply'
        fontSize='20px'
        onClick={onOpen}
        icon={<ChatIcon />}
      />
      </Tooltip>
    </HStack>
    <Reply op={true} isOpen={isOpen} onClose={onClose} onPost={post} />
    </VStack>
  );
}

export default Catalog;
