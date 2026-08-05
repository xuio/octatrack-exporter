/** Hand a Blob to the browser as a download, then release the object URL. */
export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const openHtml = (html) =>
  window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
