declare module "*.wasm" {
  const module: WebAssembly.Module
  export default module
}
declare module "*.zdict" {
  const dictionary: ArrayBuffer
  export default dictionary
}
