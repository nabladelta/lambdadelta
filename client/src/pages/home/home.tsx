import React, {useEffect, useState} from 'react'
import {
  VStack,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
  Text,
  Center,
  Heading
} from "@chakra-ui/react"
import { Link, useParams } from 'react-router-dom'

function Home() {
 
  return (
    <Center minH={'70vh'} textAlign={'center'}>
      <VStack spacing={3}>
        <Heading size='4xl'>Bernkastel  Project</Heading>
        <Heading size='2xl'>[The New BBS]</Heading>
        <Heading size='xl'>[The New BBS]</Heading>
        <Heading size='lg'>[The New BBS]</Heading>
        <Heading size='md'>[The New BBS]</Heading>
        <Heading size='sm'>[The New BBS]</Heading>
        <Heading size='xs'>[The New BBS]</Heading>
      </VStack>
    </Center>
  )
}

export default Home
