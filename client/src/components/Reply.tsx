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
  Textarea
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

  type ModelElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

function useModel<E extends ModelElement>(
    initial?: string,
    onChange?: React.ChangeEventHandler<E>
    ) {
    const [value, setValue] = React.useState<string>(initial || "")
    const handler: React.ChangeEventHandler<E> = (e) => {
        // Store the current value and run the callback function if provided
        setValue(e.currentTarget.value)
        onChange && onChange(e)
    }
    const model = { value, onChange: handler }
    return { model, setModel: setValue }
}

function Reply({isOpen, onClose, onPost, op}: {op?: boolean, isOpen: boolean, onClose: () => void, onPost: (post: IPost) => void}) {

    const name = useModel()
    const sub = useModel()
    const com = useModel()

    function submit() {
        onPost({
            no: "",
            time: Math.floor(Date.now()/1000),
            com: com.model.value || "",
            sub: sub.model.value || undefined,
            name: name.model.value || undefined,
        })
    }

    const firstField: any = React.useRef()
    return (
        <Drawer
            isOpen={isOpen}
            placement='bottom'
            initialFocusRef={firstField}
            onClose={onClose}
            size={'lg'}
        >
            {/* <DrawerOverlay /> */}
            <DrawerContent>
                <DrawerCloseButton />
                <DrawerHeader borderBottomWidth='1px'>New post</DrawerHeader>
                <DrawerBody>
                    <Stack spacing='24px'>
                    <Box>
                        <FormLabel htmlFor='name'>Name</FormLabel>
                        <Input id='name' placeholder='Anonymous' {...name.model} />
                    </Box>

                    {op && <Box>
                        <FormLabel htmlFor='sub'>Subject</FormLabel>
                        <Input id='sub' {...sub.model} />
                    </Box>}

                    <Box>
                        <FormLabel htmlFor='desc'>Comment</FormLabel>
                        <Textarea ref={firstField} size={'lg'} id='desc' {...com.model} />
                    </Box>
                    </Stack>
                </DrawerBody>
                <DrawerFooter borderTopWidth='1px'>
                    <Button variant='outline' mr={3} onClick={onClose}>Close</Button>
                    <Button colorScheme={'gray'} onClick={submit}>Post</Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

export default Reply
