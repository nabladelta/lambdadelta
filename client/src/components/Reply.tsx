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
  IconButton,
  FormHelperText
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
import { useForm } from 'react-hook-form'

import FileUpload from './FileUpload'
import { FiFile } from 'react-icons/fi'
import { getFileData } from '../utils/utils'


type ModelElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

type FormValues = {
    file_: FileList
    name: string,
    com: string,
    sub: string
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

    async function submit() {
        const formData = getValues()
        const file = formData.file_.item(0)
        const attachments = []
        if (file) {
            attachments.push(await getFileData(file))
        }
        console.log(formData.name, formData.sub, formData.com)
        onPost({
            attachments,
            post: {
                no: "",
                id: "",
                time: Math.floor(Date.now()/1000),
                com: formData.com || "",
                sub: op ? formData.sub || undefined : undefined,
                name: formData.name || undefined,
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

    return (
        <Drawer
            isOpen={isOpen}
            placement='bottom'
            onClose={onClose}
            size={'md'}
            variant={'alwaysOpen'}
            trapFocus={false}
            closeOnOverlayClick={false}
            blockScrollOnMount={false}
        >
            {/* <DrawerOverlay /> */}
            <DrawerContent >
                <DrawerCloseButton />
                <DrawerHeader borderBottomWidth='1px'>New post</DrawerHeader>
                <DrawerBody>
                    <Stack spacing='24px'>
                        <FormControl maxW={'35rem'} isInvalid={!!errors.name}>
                            <FormLabel htmlFor='name'>Name</FormLabel>
                            <Input id='name' placeholder='Anonymous' 
                                {...register("name", {maxLength: 128})}
                            />
                            <FormErrorMessage>{errors.name && errors?.name.message}</FormErrorMessage>
                        </FormControl>

                        {op &&
                        <FormControl maxW={'35rem'} isInvalid={!!errors.sub} >
                            <FormLabel htmlFor='sub'>Subject</FormLabel>
                            <Input id='sub'
                                {...register("sub", {maxLength: 128})}
                            />
                            <FormErrorMessage>{errors.sub && errors?.sub.message}</FormErrorMessage>
                        </FormControl>}

                        <FormControl isInvalid={!!errors.com} >
                            <FormLabel htmlFor='desc'>Comment</FormLabel>
                            <Textarea 
                            {...register("com", {maxLength: 4096})}
                            />
                            <FormErrorMessage>{errors.com && errors?.com.message}</FormErrorMessage>
                        </FormControl>

                        <FormControl isInvalid={!!errors.file_} >
                            <FileUpload
                                buttonText={filename ? 'Change File' : 'Upload'}
                                accept={'image/jpeg, image/png, image/gif, image/webp, image/avif, image/tiff, image/svg, video/mp4, video/webm'}
                                multiple
                                register={register('file_', { validate: validateFiles, onChange: onFileChange, })}
                            />
                            <FormHelperText>{filename ? filename : 'Video or image. Up to 5MiB accepted.' }</FormHelperText>
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
