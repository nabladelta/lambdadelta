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
  Link as CLink,
  HStack,
  IconButton,
  Tooltip
} from "@chakra-ui/react"
import { ArrowBackIcon, ArrowDownIcon, ArrowUpIcon, RepeatClockIcon } from '@chakra-ui/icons'
import Post from '../../components/Post'
import { Link, NavLink } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'

function ThreadPage() {
  const [data, setData] = useState<{posts: any[]}>({posts: []})
  const toast = useToast()
  async function updateData() {
    const r = await fetch('/512.json')
    setData(await r.json())
    toast({
      // title: 'Thread Updated',
      description: "Thread Updated",
      status: 'success',
      duration: 1500,
    })
  }

  useEffect(() => {
    updateData()
  }, [])
  return (
    <VStack align="flex-start" spacing={8}>
    <HStack id={'top'} spacing={6}>
      <Tooltip label='Return'>
      <Link to="../catalog" >
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
    </HStack>
    <VStack align="flex-start" spacing={8}>
      {data.posts.map(p => <Post key={p.no} post={p as any}/>)}
    </VStack>
    <HStack id={'bottom'} spacing={6}>
      <Tooltip label='Return'>
        <Link to="../catalog" >
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
    </HStack>
    </VStack>
  );
}

export default ThreadPage;
