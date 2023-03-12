import React, { useEffect, useState, useRef } from 'react'
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
  FormHelperText,
  Flex,
  Spacer,
  Slide,
  VStack
} from "@chakra-ui/react"

import { useForm } from 'react-hook-form'

import FileUpload from './FileUpload'
import { getFileData } from '../utils/utils'
import { CloseIcon } from '@chakra-ui/icons'
import { buttonStyle } from '../pages/board/catalog'


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

function Reply({isOpen, onOpen, onClose, onPost, op, setQuote}: { onOpen?: () => void, setQuote?: React.Dispatch<React.SetStateAction<((no: string) => void) | undefined>>, op?: boolean, isOpen: boolean, onClose: () => void, onPost: (data: {post: IPost, attachments: IFileData[]}) => Promise<boolean | void>}) {
    const { register, formState: {errors}, getValues, setValue, reset } = useForm<FormValues>({
            mode:'onBlur',
            defaultValues: { name: '', com: '', sub: '' }
            })
    const [filename, setFilename] = useState<string|undefined>()

    async function submit() {
        const formData = getValues()
        const file = formData.file_.item(0)
        const attachments = []
        if (file) {
            attachments.push(await getFileData(file))
        }
        const res = await onPost({
            attachments,
            post: {
                no: "",
                id: "",
                time: Math.floor(Date.now()/1000),
                com: formData.com || "",
                sub: op ? formData.sub || undefined : undefined,
                name: formData.name || undefined,
        }})
        if (res) {
            console.log('reset')
            reset()
            if (inputRef.current) inputRef.current.value = ''
            setFilename('')
        }
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

    function addText(text: string) {
        const currentCom = getValues().com
        setValue("com", currentCom+text)
    }

    function cleanQuote(line: string) {
        // Avoid turning greentext into quotelinks
        if (line.startsWith('>')) return '> '+line
        else return '>'+line
    }

    function buildQuote(no: string, quotedText: string) {
        return (['\n>>'+no].concat(quotedText.split('\n').map(l => l.length > 0 ? cleanQuote(l) : ''))).join('\n')
    }

    function quote(no: string) {
        console.log('Quoting ', no)
        const selectedText = document.getSelection()?.toString() || ''
        const quote = buildQuote(no, selectedText)
        addText(quote)
        if (onOpen) onOpen()
    }

    useEffect(()=> {
        if (setQuote) setQuote(() => quote)
    }, [])

    const inputRef = useRef<HTMLInputElement | null>(null)

    return (
        <Slide
            in={isOpen}
            direction='bottom'
            style={{ zIndex: 10 }}
        >
            <Box
                p='20px'
                color='white'
                mt='4'
                bg='gray.700'
                rounded='md'
                shadow='md'
            >
                <Stack spacing='24px'>
                    <Flex>
                        <Heading>{op ? "New Thread" : "New post"}</Heading>
                        <Spacer/>
                        <IconButton aria-label='Close' onClick={onClose} {...buttonStyle} icon={<CloseIcon />} />
                    </Flex>
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
                            inputRef={inputRef}
                            buttonText={filename ? 'Change File' : 'Upload'}
                            accept={'image/jpeg, image/png, image/gif, image/webp, image/avif, image/tiff, image/svg, video/mp4, video/webm'}
                            multiple
                            register={register('file_', { validate: validateFiles, onChange: onFileChange, })}
                        />
                        <FormHelperText>{filename ? filename : 'Video or image. Up to 5MiB accepted.' }</FormHelperText>
                        <FormErrorMessage>{errors.file_ && errors?.file_.message}</FormErrorMessage>
                    </FormControl>
                    <Flex maxW={'35rem'}>
                        <Button variant='outline' mr={3} onClick={onClose}>Close</Button>
                        <Button colorScheme={'gray'} onClick={submit}>Post</Button>
                    </Flex>
                </Stack>
            </Box>
        </Slide>
    )
}

export default Reply
