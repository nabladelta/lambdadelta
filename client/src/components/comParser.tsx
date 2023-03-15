import React, {useEffect, useState} from 'react'
import {
  VStack,
  Link as CLink,
  HStack,
  IconButton,
  Tooltip,
  Text,
  useDisclosure
} from "@chakra-ui/react"
import { ReplyLink } from './Post'



function isGreentext(line: string) {
    line = line.trim()
    if (line[0] == '>' && line[1] != '>') return true
  
    return false
  }
  
  function handleThreadLinks(text: string) {
    const firstLink = text.indexOf('>>>')
    if (firstLink == -1) return text
    return <>{text.split('>>>').map((quoteText, i) => {
      // Handle special case of first text section, which might not have a quotelink
      if (firstLink != 0 && i == 0) return <React.Fragment key={i}>{quoteText}</React.Fragment>
      if (!quoteText || !quoteText.length) return
      const firstSpace = quoteText.indexOf(' ')
      // No space means there is no text
      const quoteRef = firstSpace != -1 ? quoteText.slice(0, firstSpace) : quoteText
      const text = firstSpace != -1 ? quoteText.slice(firstSpace) : undefined
      if (quoteRef.length == 64) {
        // Valid quotelink, create the corresponding element
        return <React.Fragment key={i}>
                <ReplyLink post={{id: quoteRef, no: "", com: "", time: 0}} isRemote={true} isInCom={true} />{text && <Text as='span'>{' '+text}</Text>}
              </React.Fragment>
      } else {
        // We restore whatever this was
        return <React.Fragment key={i}>{'>>>'+quoteText}</React.Fragment>
      }
    })}</>
  }
  
  function handleQuoteLinks(line: string, quoteCallback: (quoteRef: string) => IPost | false) {
    const firstLink = line.indexOf('>>')
    if (firstLink == -1) return line
    return <>{line.split('>>').map((quoteText, i) => {
      // Handle special case of first text section, which might not have a quotelink
      if (firstLink != 0 && i == 0) return <React.Fragment key={i}>{quoteText}</React.Fragment>
      if (!quoteText || !quoteText.length) return
      const firstSpace = quoteText.indexOf(' ')
      // No space means there is no text
      const quoteRef = firstSpace != -1 ? quoteText.slice(0, firstSpace) : quoteText
      const text = firstSpace != -1 ? quoteText.slice(firstSpace) : undefined
      const res = quoteCallback(quoteRef)
      if (res) {
        // Valid quotelink, create the corresponding element
        return <React.Fragment key={i}>
                <ReplyLink post={res} isInCom={true}></ReplyLink>{text && <Text as='span'>{' '+text}</Text>}
              </React.Fragment>
      } else {
        // We restore whatever this was
        return <React.Fragment key={i}>{handleThreadLinks('>>'+quoteText)}</React.Fragment>
      }
    })}</>
  }
  
  function handleLine(line: string, i: number, quoteCallback: (quoteRef: string) => IPost | false) {
    if (isGreentext(line)) {
      return <React.Fragment key={i}>
          <Text as='span' key={i} color={isGreentext(line) ? 'green.300' : undefined}>{handleQuoteLinks(line, quoteCallback)}</Text><br/>
        </React.Fragment>
    }
    return <React.Fragment key={i}>{handleQuoteLinks(line, quoteCallback)}<br/></React.Fragment>
  }

  export function processCom(com: string, quoteCallback: (quoteRef: string) => IPost | false) {
    return (
    <Text align={'left'} >
      {com.split('\n').map((line, i) => 
        handleLine(line, i, quoteCallback))}
    </Text>)
  }
  
  export function processComs(thread: IThread) {
    const processed: IProcessedThread = {replies: {}, posts: [], postsByRef: {}}
    for (let post of thread.posts) {
      processed.postsByRef[post.no] = post
    }
    const quoteCallback = (post: IPost, quoteRef: string) => {
      // Doesn't look like a quoteref (will need to do more verification here eventually)
      if (quoteRef.length != 16) return false
  
      if (!processed.replies[quoteRef]) processed.replies[quoteRef] = new Set<IPost>
      processed.replies[quoteRef].add(post)
      return processed.postsByRef[quoteRef]
    }
    for (let post of thread.posts) {
        post.parsedCom = processCom(post.com, (quoteRef: string) => quoteCallback(post, quoteRef))
        processed.posts.push(post)
    }
    return processed
  }