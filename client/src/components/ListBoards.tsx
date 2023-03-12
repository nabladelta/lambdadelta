import React, {useEffect, useState} from 'react'
import {
  HStack,
  Text
} from "@chakra-ui/react"
import { Link } from 'react-router-dom'
import { fetchBoards } from '../app/posts'

function BoardList() {
  const [data, setData] = useState<IBoardList>({boards: []})
  async function updateData() {
    try {
      const response = await fetchBoards()
      setData(response)
    } catch (e) {
      console.log((e as Error).message)
    }
  }
  const isLast = (name: string) => {
    if (data.boards.length == 0) return false
    const last = data.boards[data.boards.length - 1]
    return last.board == name
  }
  useEffect(() => {
    updateData()
  }, [])
  return (
    <HStack paddingTop={1} justifySelf="flex-start" align="flex-start" spacing={3}>
      <Text >[</Text>
      {data.boards.map((b, i) => <React.Fragment key={b.board}>
        <Link to={`/${b.board}/catalog`}><Text as='b'>{b.board}</Text></Link> 
        {!isLast(b.board) && <Text>/</Text>}
      </React.Fragment>)}
      <Text>]</Text>
    </HStack>
  )
}

export default BoardList;
