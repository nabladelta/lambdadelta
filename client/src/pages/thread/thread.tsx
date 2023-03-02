import React, {useEffect, useState} from 'react'
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
} from "@chakra-ui/react"
import { CardHeader, CardBody, CardFooter } from '@chakra-ui/react'
import Post from '../../components/Post';

function ThreadPage() {
  const [data, setData] = useState<{posts: any[]}>({posts: []})
  useEffect( () => {
    fetch('/512.json')
    .then(response => response.json())
    .then(data => setData(data))
  }, [])
  return (
    <VStack align="flex-start" spacing={8}>
      {data.posts.map(p => <Post key={p.no} post={p as any}/>)}
    </VStack>
  );
}

export default ThreadPage;
