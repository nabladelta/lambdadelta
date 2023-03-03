import React, { useMemo } from 'react'
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

function Reply({isOpen, onClose, onPost}: {isOpen: boolean, onClose: () => void, onPost: () => void}) {
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
                    id='name'
                    placeholder='Anonymous'
                    />
                </Box>

                <Box>
                    <FormLabel htmlFor='desc'>Comment</FormLabel>
                    <Textarea size={'lg'} id='desc' ref={firstField} />
                </Box>
                </Stack>
            </DrawerBody>

            <DrawerFooter borderTopWidth='1px'>
                <Button variant='outline' mr={3} onClick={onClose}>
                Close
                </Button>
                <Button colorScheme={'gray'} onClick={onPost}>Post</Button>
            </DrawerFooter>
            </DrawerContent>
        </Drawer>
    </>
    )
}

export default Reply
