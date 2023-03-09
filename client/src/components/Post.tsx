import React, { useMemo } from 'react'
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

function formatBytes(bytes: number, decimals = 0) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function truncate(str: string, n: number){
    return (str.length > n) ? str.slice(0, n-1) + '(…)' : str;
};

function Post({post, vertical}:{post: IPost, vertical?: boolean}) {
    const dateString = useMemo(()=> {
        const date = new Date(post.time * 1000)
        const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        return `${date.getDate()}/${date.getMonth()}/${date.getFullYear().toString().slice(2)}(${weekday[date.getDay()]})${date.toLocaleTimeString()}`
    }, [post.time])
    
    return (
        <Card
            direction={vertical ? undefined : { base: 'column', sm: 'row' }}
            overflow='hidden'
            variant='outline'>
                {post.tim && <Image
                    objectFit='cover'
                    maxW={vertical ? undefined : { base: '100%', sm: `${post.tn_w}px` }}
                    src={`http://localhost:8089/api/thumb/${post.tim}.jpg`}
                    alt={`${post.filename}${post.ext}`}
                />}
            <Stack>
                <CardHeader>
                {vertical && 
                    <VStack spacing={3}>
                        {post.sub && <Text as='b'>{post.sub}</Text>}
                        {post.replies && <HStack spacing={3}><Text as='i'>R: </Text><Text as='b'>{post.replies}</Text></HStack>}
                    </VStack>
                }
                {!vertical && 
                <HStack spacing={7}>{post.sub && <Text as='b'>{post.sub}</Text>}<Text as='b'>{post.name || "Anonymous"}</Text><Text>{dateString}</Text><Text>No. {post.no.slice(-16)}</Text>{/*<Text fontSize='sm' as='u'>&gt;&gt;Z55ASQDFBS7FFQ</Text>*/}</HStack>
                }
                </CardHeader>
                <CardBody>
                    <Text noOfLines={vertical ? 3 : undefined} align={'left'} py='2'>
                        {post.com}
                    </Text>
                </CardBody>

                <CardFooter>
                {!vertical && <HStack spacing={7}>{post.filename && <Tooltip label={`${post.filename}${post.ext}`}><Text as='i'>{`File: ${truncate(post.filename, 24)}${post.ext}`}</Text></Tooltip>}{post.fsize  && <Text as='i'>{`(${formatBytes(post.fsize)}, ${post.w}x${post.h})`}</Text>}</HStack>}
                </CardFooter>
            </Stack>
        </Card>
  )
}

export default Post
