import React, { useMemo, useState } from 'react'
import {
  ChakraProvider,
  Box,
  Stack,
  Heading,
  Button,
  HStack,
  Tooltip,
  FormLabel,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  Select,
  Textarea,
  useDisclosure
} from "@chakra-ui/react"

import {
    Drawer,
    DrawerBody,
    DrawerFooter,
    DrawerHeader,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
  } from '@chakra-ui/react'

import { AddIcon } from '@chakra-ui/icons'

function Reply({isOpen, onClose, onPost, op}: {op?: boolean, isOpen: boolean, onClose: () => void, onPost: (post: IPost) => void}) {
    const [post, setPost] = useState<IPost>({com : "", sub: undefined, name: undefined, time: undefined, no: ""})

    const firstField: any = React.useRef()
    return (
        <>
        <Drawer
            isOpen={isOpen}
            placement='right'
            initialFocusRef={firstField}
            onClose={onClose}
            size={'lg'}
        >
            <DrawerOverlay />
            <DrawerContent>
            <DrawerCloseButton />
            <DrawerHeader borderBottomWidth='1px'>
                Write a new post
            </DrawerHeader>

            <DrawerBody>
                <Stack spacing='24px'>
                <Box>
                    <FormLabel htmlFor='name'>Name</FormLabel>
                    <Input
                        value={post.name}
                        id='name'
                        placeholder='Anonymous'
                        onChange={(e) => setPost((p) => {p.name = e.target.value; return p})}
                    />
                </Box>

                {op && <Box>
                    <FormLabel htmlFor='sub'>Subject</FormLabel>
                    <Input
                    value={post.sub}
                    onChange={(e) => setPost((p) => {p.sub = e.target.value; return p})}
                    id='sub'
                    />
                </Box>}

                <Box>
                    <FormLabel htmlFor='desc'>Comment</FormLabel>
                    <Textarea 
                    value={post.com}
                    onChange={(e) => setPost((p) => {p.com = e.target.value; return p})}
                    size={'lg'} id='desc' ref={firstField} />
                </Box>
                </Stack>
            </DrawerBody>

            <DrawerFooter borderTopWidth='1px'>
                <Button variant='outline' mr={3} onClick={onClose}>
                Close
                </Button>
                <Button colorScheme={'gray'} onClick={() => onPost(post)}>Post</Button>
            </DrawerFooter>
            </DrawerContent>
        </Drawer>
    </>
    )
}

export default Reply
