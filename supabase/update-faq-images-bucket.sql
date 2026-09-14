-- Supabase SQL Editor에서 한 번 실행하세요.
-- faq-images 버킷의 파일당 제한을 20MB로 늘리고 허용 형식을 추가합니다.
update storage.buckets
set
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/x-hwp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
where id = 'faq-images';
