import React, { useMemo, useState } from 'react'
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
  Tooltip
} from "@chakra-ui/react"
import { CardHeader, CardBody, CardFooter } from '@chakra-ui/react'
import { API_URL } from '../constants'
import { formatBytes, getPostDateString, isVideo, truncateText } from '../utils/utils'

function Post({post, vertical}:{post: IPost, vertical?: boolean}) {
    const dateString = useMemo(()=> {
        return getPostDateString(post.time)
    }, [post.time])

    const [imageWide, setImageWide] = useState(false)

    function imageClick(e: any) {
        e.preventDefault()
        setImageWide((s)=> !s)
    }
    return (
        <Card
            direction={{ base: 'column', sm: 'row' }}
            overflow='hidden'
            variant='outline'>
                {post.tim && !isVideo(post) &&

                <a href={`${API_URL}/file/${post.tim}${post.ext}`} target='_blank' onClick={imageClick}>
                    <Image
                    objectFit='contain'
                    boxSize={imageWide ? post.h : undefined}
                    maxW={vertical ? undefined : imageWide ? { base: '100%', sm: `512px` } : { base: '150%', sm: `1024px` }}
                    src={imageWide ? `${API_URL}/file/${post.tim}${post.ext}` : `${API_URL}/thumb/${post.tim}.jpg`}
                    alt={`${post.filename}${post.ext}`} />

                </a>}
                {post.tim && isVideo(post) &&
                    <Box
                        as='video'
                        controls
                        loop={true}
                        src={`${API_URL}/file/${post.tim}${post.ext}`}
                        title={`${post.filename}${post.ext}`}
                        objectFit='contain'
                        sx={{
                            aspectRatio: `${post.h}/${post.w}`
                        }}
                    />}
            <Stack>
                <CardHeader>
                    <HStack spacing={7}>
                        {post.sub && <Text noOfLines={2} as='b'>{post.sub}</Text>}<Text as='b' noOfLines={1}>{post.name || "Anonymous"}</Text><Text>{dateString}</Text><Text>No. {post.no.slice(-16)}</Text>{/*<Text fontSize='sm' as='u'>&gt;&gt;Z55ASQDFBS7FFQ</Text>*/}
                    </HStack>
                </CardHeader>
                <CardBody>
                    <Text align={'left'} py='2'>
                        {post.com}
                    </Text>
                </CardBody>

                <CardFooter>
                    <HStack spacing={7}>
                        {post.filename && <Tooltip label={`${post.filename}${post.ext}`}><Text as='i'>File: <a href={`${API_URL}/file/${post.tim}${post.ext}`} target='_blank'>{`${truncateText(post.filename, 24)}${post.ext}`}</a></Text></Tooltip>}{post.fsize  && <Text as='i'>{`(${formatBytes(post.fsize)}, ${post.w}x${post.h})`}</Text>}
                    </HStack>
                </CardFooter>
            </Stack>
        </Card>
  )
}

export default Post
