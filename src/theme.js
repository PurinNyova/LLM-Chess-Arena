import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  fonts: {
    heading: `'Segoe UI', system-ui, sans-serif`,
    body: `'Segoe UI', system-ui, sans-serif`,
    mono: `'Cascadia Code', 'Fira Code', monospace`,
  },
  colors: {
    board: {
      light: '#F0D9B5',
      dark: '#B58863',
      highlightLight: '#F7EC5D',
      highlightDark: '#DAC32B',
    },
  },
});

export default theme;
