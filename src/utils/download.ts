/** Blob 데이터를 브라우저 다운로드로 저장하는 유틸 (dashboard에서 사용) */
export function downloadBlob(data: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // 클릭 처리 후 오브젝트 URL 해제
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
