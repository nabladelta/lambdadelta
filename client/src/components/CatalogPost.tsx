import React, { useMemo, useState } from 'react'
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
  HStack,
  Tooltip
} from "@chakra-ui/react"
import { CardHeader, CardBody, CardFooter } from '@chakra-ui/react'
import { API_URL } from '../constants'
import { formatBytes, getPostDateString, isVideo, truncateText } from '../utils/utils'
import { LinkBox, LinkOverlay } from '@chakra-ui/react'
import { Link, useParams, useNavigate } from 'react-router-dom'

function CatalogPost({post}:{post: IPost}) {
    const dateString = useMemo(()=> {
        return getPostDateString(post.time)
    }, [post.time])

    const { board } = useParams()

    const label = `by ${truncateText(post.name || "Anonymous", 24)} on ${dateString}`

    return (
        <LinkBox as={Card}
        overflow='hidden'
        variant='outline'>
        {post.tim && !isVideo(post) &&
            <Image
            objectFit='contain'
            src={`${API_URL}/thumb/${post.tim}.jpg`}
            alt={`${post.filename}${post.ext}`} />}
            {post.tim && isVideo(post) &&
            <Box
                as='video'
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
                    <VStack spacing={3}>
                        {post.sub && <Text noOfLines={2} as='b'>{post.sub}</Text>}
                        
                        <LinkOverlay as={Link} to={`/${board}/thread/${post.id}`}>
                            <HStack spacing={3}>
                                <Text>R: </Text><Text as='b'>{post.replies}</Text>
                                <Text>|</Text>
                                <Text>I: </Text><Text as='b'>{post.images || 0}</Text>
                            </HStack>
                        </LinkOverlay>
                    </VStack>
                </CardHeader>
                <CardBody>
                    <Text noOfLines={3} align={'left'} py='2'>
                        {post.com}
                    </Text>
                </CardBody>
            </Stack>
        </LinkBox>
  )
}

export default CatalogPost
