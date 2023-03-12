import React, { useContext, useEffect, useMemo, useState } from 'react'
import {
  ChakraProvider,
  Box,
  Text,
  Link,
  VStack,
  Code,
  Grid,
  Card,
  Image,
  Stack,
  Heading,
  Button,
  HStack,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverHeader,
  PopoverArrow,
  PopoverContent,
  PopoverCloseButton,
  PopoverBody,
  Portal
} from "@chakra-ui/react"
import { CardHeader, CardBody, CardFooter } from '@chakra-ui/react'
import { API_URL } from '../constants'
import { formatBytes, getPostDateString, isElementInViewport, isVideo, truncateText } from '../utils/utils'
import { useLocation, useParams } from 'react-router-dom'
import { HighlightContext } from '../pages/thread/thread'
import { fetchThread } from '../app/posts'
import { processCom } from './comParser'

function Post({post, replies, highlight}: {post: IPost, replies?: Set<IPost>, highlight?: string}) {
    const dateString = useMemo(()=> {
        return getPostDateString(post.time)
    }, [post.time])

    const [imageWide, setImageWide] = useState(false)
    const {hash} = useLocation()
    const isHighlighted = highlight == post.no
    const isInURI = hash == `#p${post.no}`

    function imageClick(e: any) {
        e.preventDefault()
        setImageWide((s)=> !s)
    }
    return (
        <Card
            id={`p${post.no}`}
            bg={ isHighlighted || isInURI ? (isHighlighted && isInURI ? "whiteAlpha.100" : "whiteAlpha.50") : undefined}
            direction={{ base: 'row', sm: "column", md: "column", lg: "column", xl: "row"  }}
            overflow='hidden'
            variant='outline'>
                {post.tim && !isVideo(post) &&
                <a href={`${API_URL}/file/${post.tim}${post.ext}`} target='_blank' onClick={imageClick}>
                    <Image
                        objectFit='contain'
                        // boxSize={imageWide ? post.h : undefined}
                        // maxW={imageWide ? '512px' : '100%'}
                        src={imageWide ? `${API_URL}/file/${post.tim}${post.ext}` : `${API_URL}/thumb/${post.tim}.jpg`}
                        alt={`${post.filename}${post.ext}`}
                    />
                </a>}
                {post.tim && isVideo(post) &&
                    <Box
                        as='video'
                        controls
                        loop={true}
                        maxW={'512px'}
                        src={`${API_URL}/file/${post.tim}${post.ext}`}
                        title={`${post.filename}${post.ext}`}
                        objectFit='contain'
                        sx={{
                            aspectRatio: `${post.h}/${post.w}`
                        }}
                    />}
            <Stack flex={1}>
                <CardHeader>
                    <HStack spacing={7}>
                        {post.sub && <Text noOfLines={2} as='b'>{post.sub}</Text>}
                        <Text as='b' noOfLines={1}>{post.name || "Anonymous"}</Text>
                        <Text>{dateString}</Text>
                        <Text><Link _hover={{color: 'red'}} href={`#p${post.no}`}>No.</Link> {post.no}</Text>
                        {replies && <HStack spacing={2}>{Array.from(replies).map((p, i) => <ReplyLink key={i} post={p}></ReplyLink>)}</HStack>}
                    </HStack>
                </CardHeader>
                <CardBody>
                    {post.parsedCom}
                </CardBody>

                <CardFooter>
                    <HStack spacing={7}>
                        {post.filename && 
                        <Tooltip label={`${post.filename}${post.ext}`}>
                            <Text as='i'>File: <a href={`${API_URL}/file/${post.tim}${post.ext}`} target='_blank'>{`${truncateText(post.filename, 24)}${post.ext}`}</a></Text>
                        </Tooltip>}
                        {post.fsize  && <Text as='i'>{`(${formatBytes(post.fsize)}, ${post.w}x${post.h})`}</Text>}
                    </HStack>
                </CardFooter>
            </Stack>
        </Card>
  )
}

export default Post

export function ReplyLink({post, isInCom, isRemote}: {post: IPost, isInCom?: boolean, isRemote?: boolean}) {
    const setHighlight = useContext(HighlightContext)
    async function mouseEnter() {
        const postElement = document.getElementById(`p${post.no}`)
        if (postElement && isElementInViewport(postElement)) {
            if (setHighlight) setHighlight(post.no)
        } else {
            // Fetch if remote and not yet fetched
            if (isRemote && !remotePost && board) {
                try {
                    console.log('Fetched remote post')
                    const thread = await fetchThread(board, post.id)
                    const op = thread.posts[0]
                    // We presume quotelinks are impossible on an OP
                    op.parsedCom = processCom(op.com, (quoteRef: string) => false)
                    setRemotePost(op)
                } catch (e) {
                    return
                }
            }
            setIsOpen(true)
        }
    }
    function mouseLeave() {
        if (setHighlight) setHighlight('')
        setIsOpen(false)
    }
    const [isOpen, setIsOpen] = useState(false)

    const { board } = useParams()
    const [remotePost, setRemotePost] = useState<IPost | undefined>()

    return (
        <Popover
            isOpen={isOpen} 
            onClose={() => setIsOpen(false)}
            trigger='hover'
            openDelay={0} closeDelay={0}
            isLazy
            placement={isInCom ? 'top' : 'bottom'}
            >
            <PopoverTrigger>
                <Link {...(isInCom ? {color: 'red.500'} : {fontSize: 'sm'})}
                textDecoration={'underline'} 
                onMouseEnter={mouseEnter} onMouseLeave={mouseLeave} 
                _hover={{color: 'red'}}
                target={isRemote ? "_blank" : undefined} 
                href={isRemote ? `/${board}/thread/${post.id}` : `#p${post.no}`}
                >&gt;&gt;{isRemote ? `>${post.id}` : post.no}</Link>
            </PopoverTrigger>
            <Portal>
                <PopoverContent boxSize={'100%'}>
                    <Box fontSize="xl">
                        <Post post={isRemote && remotePost ? remotePost : post}></Post>
                    </Box>
                </PopoverContent>
            </Portal>
        </Popover>
    )
}