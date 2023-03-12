import React, {useEffect, useState} from 'react'
import {
  VStack,
  Link as CLink,
  SimpleGrid,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
  Wrap
} from "@chakra-ui/react"
import { ArrowBackIcon, ArrowDownIcon, ArrowUpIcon, RepeatClockIcon, ChatIcon } from '@chakra-ui/icons'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useToast } from '@chakra-ui/react'
import Reply from '../../components/Reply'
import CatalogPost from '../../components/CatalogPost'
import { fetchCatalog, postThread } from '../../app/posts'

export const buttonStyle = { variant:'outline', colorScheme:'gray', fontSize:'20px' }

function Catalog() {
  const toast = useToast()
  const { board } = useParams()
  const [data, setData] = useState<ICatalogPage[]>([])
  const navigate = useNavigate()

  async function updateData() {
    try {
      const response = await fetchCatalog(board!)
      setData(response)
      toast({
        title: 'Catalog Updated',
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
    document.title = `/${board}/ - BBS`
    updateData()
  }, [board])

  async function post(postData: {post: IPost, attachments: IFileData[]}) {
    try {
      const response = await postThread(board!, postData)
      navigate(`/${board}/thread/${response.op}`)
      toast({
        title: 'New Thread Created',
        status: 'success',
        duration: 1500,
      })
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
    <Wrap  spacing='40px' >
      {data.map(page => 
          page.threads.map(p => 
          <CatalogPost key={p.no} post={p} />
      ))}
    </Wrap>
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
