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
  Textarea,
  Icon,
  FormControl,
  FormErrorMessage,
  IconButton
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
import { useForm, UseFormRegisterReturn } from 'react-hook-form'

import FileUpload from './FileUpload'
import { FiFile } from 'react-icons/fi'
import { ArrowBackIcon, DeleteIcon } from '@chakra-ui/icons'
import { buttonStyle } from '../pages/board/catalog'
import { getFileData } from '../utils/utils'


type ModelElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

type FormValues = {
    file_: FileList
}

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

function Reply({isOpen, onClose, onPost, op}: {op?: boolean, isOpen: boolean, onClose: () => void, onPost: (data: {post: IPost, attachments: IFileData[]}) => void}) {
    const { register, formState: {errors}, getValues } = useForm<FormValues>()
    const [filename, setFilename] = useState<string|undefined>()

    const name = useModel()
    const sub = useModel()
    const com = useModel()

    async function submit() {
        const file = getValues().file_.item(0)
        const attachments = []
        if (file) {
            attachments.push(await getFileData(file))
        }
        onPost({
            attachments,
            post: {
                no: "",
                time: Math.floor(Date.now()/1000),
                com: com.model.value || "",
                sub: sub.model.value || undefined,
                name: name.model.value || undefined,
        }})
    }

    const onFileChange = (_: any) => {
        const file = getValues().file_.item(0)
        if (file) {
            setFilename(file.name)
        } else {
            setFilename("")
        }
        console.log(file)
    }

    const validateFiles = (value: FileList) => {
        if (value.length < 1) {
            return 'Files is required'
        }
        for (const file of Array.from(value)) {
            const fsMb = file.size / (1024 * 1024)
            const MAX_FILE_SIZE = 5
            if (fsMb > MAX_FILE_SIZE) {
                return 'Max file size 5mb'
            }
        }
        return true
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

                        <FormControl isInvalid={!!errors.file_} >
                            <FileUpload
                                accept={'image/*'}
                                multiple
                                register={register('file_', { validate: validateFiles, onChange: onFileChange, })}
                            >
                            <HStack>
                                <Button leftIcon={<Icon as={FiFile} />}>{filename ? 'Change File' : 'Upload'}</Button>
                                {filename && <FormLabel>{filename}</FormLabel>}
                            </HStack>
                            </FileUpload>
                            <FormErrorMessage>{errors.file_ && errors?.file_.message}</FormErrorMessage>
                        </FormControl>
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
