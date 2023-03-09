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
import Catalog from "./pages/board/catalog"
import theme from "./theme"

export const App = () => (
  <ChakraProvider theme={theme}>
    <Box fontSize="xl">
      <Grid minH="50vh" p={3}>
        <ColorModeSwitcher justifySelf="flex-end" />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/:board/catalog" element={<Catalog />} />
          <Route path="/:board/thread/:id" element={<ThreadPage />} />
        </Routes>
      </Grid>
    </Box>
  </ChakraProvider>
)
