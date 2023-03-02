import * as React from "react"
import {
  ChakraProvider,
  Box,
  Text,
  Link,
  VStack,
  Code,
  Grid,
} from "@chakra-ui/react"
import { ColorModeSwitcher } from "./components/ColorModeSwitcher"
import { Routes, Route } from 'react-router-dom'
import Home from "./pages/home/home"
import ThreadPage from "./pages/thread/thread"
import BoardPage from "./pages/board/board"
import theme from "./theme"

export const App = () => (
  <ChakraProvider theme={theme}>
    <Box textAlign="center" fontSize="xl">
      <Grid minH="100vh" p={3}>
        <ColorModeSwitcher justifySelf="flex-end" />
        <VStack spacing={8}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/:board/catalog" element={<BoardPage />} />
            <Route path="/:board/thread/:id" element={<ThreadPage />} />
          </Routes>
        </VStack> 
      </Grid>
    </Box>
  </ChakraProvider>
)
