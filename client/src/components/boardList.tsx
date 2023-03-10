import React, {useEffect, useState} from 'react'
import {
  VStack,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
  Text
} from "@chakra-ui/react"
import { Link, useParams } from 'react-router-dom'
import { API_URL } from '../constants'

function BoardList() {
  const [data, setData] = useState<IBoardList>({boards: []})
  async function updateData() {
    const r = await fetch(`${API_URL}/boards`)
    if (!r.ok) {
      const emsg: {error: string} = await r.json()
      console.log(emsg)
      return
    }
    setData(await r.json())
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
