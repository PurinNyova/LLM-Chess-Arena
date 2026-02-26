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
      light: '#EBECD0',
      dark: '#779556',
      highlightLight: '#F5F682',
      highlightDark: '#BBCC44',
    },
  },
});

export default theme;
