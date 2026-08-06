use std::fmt::Write as _;
use std::fs::{self, File};
use std::io::{Cursor, Read};
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use sha2::{Digest, Sha256};
use zip::ZipArchive;

use super::index::IndexedChunk;

const MAX_SOURCE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_OFFICE_XML_BYTES: u64 = 16 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_BYTES: usize = 8 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 1_024;
const MAX_OFFICE_TEXT_ENTRIES: usize = 512;
const MAX_PDF_PAGES: usize = 512;
const MAX_DOCUMENT_CHUNKS: usize = 256;
const CHUNK_BYTES: usize = 32 * 1024;

#[derive(Clone, Debug, PartialEq)]
pub struct ExtractedDocument {
    pub content_hash: String,
    pub extraction_version: String,
    pub chunks: Vec<IndexedChunk>,
    pub pending_enrichment: Option<String>,
}

fn failure(path: &Path, error: impl std::fmt::Display) -> ExtractionError {
    ExtractionError::Failed {
        path: path.to_string_lossy().into_owned(),
        message: error.to_string(),
    }
}

fn chunks_from_text(
    text: &str,
    extraction_kind: &str,
    page: Option<u32>,
    path: &Path,
) -> Result<Vec<IndexedChunk>, ExtractionError> {
    if text.len() > MAX_EXTRACTED_TEXT_BYTES {
        return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let mut end = (start + CHUNK_BYTES).min(text.len());
        while end > start && !text.is_char_boundary(end) {
            end -= 1;
        }
        let fragment = text[start..end].trim();
        if !fragment.is_empty() {
            if chunks.len() == MAX_DOCUMENT_CHUNKS {
                return Err(failure(path, "Document exceeds the 256 chunk limit"));
            }
            chunks.push(IndexedChunk {
                text: fragment.to_owned(),
                extraction_kind: extraction_kind.to_owned(),
                page,
                time_start_ms: None,
                time_end_ms: None,
            });
        }
        start = end;
    }
    Ok(chunks)
}

fn xml_text(xml: &str, path: &Path) -> Result<String, ExtractionError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut text = String::new();
    loop {
        buffer.clear();
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Text(value)) => {
                let decoded = value.decode().map_err(|error| failure(path, error))?;
                let decoded =
                    quick_xml::escape::unescape(&decoded).map_err(|error| failure(path, error))?;
                if !decoded.trim().is_empty() {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(decoded.trim());
                    if text.len() > MAX_EXTRACTED_TEXT_BYTES {
                        return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
                    }
                }
            }
            Ok(Event::CData(value)) => {
                let decoded = value.decode().map_err(|error| failure(path, error))?;
                if !decoded.trim().is_empty() {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(decoded.trim());
                    if text.len() > MAX_EXTRACTED_TEXT_BYTES {
                        return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
                    }
                }
            }
            Ok(Event::GeneralRef(value)) => {
                let decoded = value.decode().map_err(|error| failure(path, error))?;
                let resolved = value
                    .resolve_char_ref()
                    .map_err(|error| failure(path, error))?
                    .or_else(|| match decoded.as_ref() {
                        "amp" => Some('&'),
                        "apos" => Some('\''),
                        "gt" => Some('>'),
                        "lt" => Some('<'),
                        "quot" => Some('"'),
                        _ => None,
                    });
                if let Some(character) = resolved {
                    if !text.is_empty() && !text.ends_with(char::is_whitespace) {
                        text.push(' ');
                    }
                    text.push(character);
                    text.push(' ');
                    if text.len() > MAX_EXTRACTED_TEXT_BYTES {
                        return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
                    }
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(failure(path, error)),
        }
    }
    Ok(text.split_whitespace().collect::<Vec<_>>().join(" "))
}

fn is_office_text_entry(extension: &str, name: &str) -> bool {
    match extension {
        "docx" => {
            name == "word/document.xml"
                || (name.starts_with("word/header") && name.ends_with(".xml"))
                || (name.starts_with("word/footer") && name.ends_with(".xml"))
        }
        "xlsx" => {
            name == "xl/sharedStrings.xml"
                || (name.starts_with("xl/worksheets/") && name.ends_with(".xml"))
        }
        "pptx" => name.starts_with("ppt/slides/slide") && name.ends_with(".xml"),
        _ => false,
    }
}

fn extract_office(
    bytes: &[u8],
    path: &Path,
    extension: &str,
) -> Result<Vec<IndexedChunk>, ExtractionError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|error| failure(path, error))?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(failure(path, "Office archive exceeds the 1024 entry limit"));
    }
    let mut total_bytes = 0_u64;
    let mut text_entries = 0_usize;
    let mut combined = String::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| failure(path, error))?;
        if !is_office_text_entry(extension, entry.name()) {
            continue;
        }
        text_entries = text_entries.saturating_add(1);
        if text_entries > MAX_OFFICE_TEXT_ENTRIES {
            return Err(failure(
                path,
                "Office archive exceeds the 512 text-entry limit",
            ));
        }
        let remaining = MAX_OFFICE_XML_BYTES.saturating_sub(total_bytes);
        if entry.size() > remaining {
            return Err(failure(
                path,
                "Office XML exceeds the 16 MiB extraction limit",
            ));
        }
        let mut bytes =
            Vec::with_capacity(usize::try_from(entry.size().min(remaining)).unwrap_or_default());
        (&mut entry)
            .take(remaining + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| failure(path, error))?;
        if bytes.len() as u64 > remaining {
            return Err(failure(
                path,
                "Office XML exceeds the 16 MiB extraction limit",
            ));
        }
        total_bytes = total_bytes.saturating_add(bytes.len() as u64);
        let xml = String::from_utf8(bytes).map_err(|error| failure(path, error))?;
        let extracted = xml_text(&xml, path)?;
        if !extracted.is_empty() {
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&extracted);
            if combined.len() > MAX_EXTRACTED_TEXT_BYTES {
                return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
            }
        }
    }
    chunks_from_text(&combined, "office-xml", None, path)
}

fn chunks_from_pdf_pages(
    pages: &[String],
    path: &Path,
) -> Result<Vec<IndexedChunk>, ExtractionError> {
    if pages.len() > MAX_PDF_PAGES {
        return Err(failure(path, "PDF exceeds the 512 page extraction limit"));
    }
    let mut extracted_bytes = 0_usize;
    let mut chunks = Vec::new();
    for (index, text) in pages.iter().enumerate() {
        extracted_bytes = extracted_bytes.saturating_add(text.len());
        if extracted_bytes > MAX_EXTRACTED_TEXT_BYTES {
            return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
        }
        let page_chunks = chunks_from_text(text, "pdf-text", u32::try_from(index + 1).ok(), path)?;
        if chunks.len().saturating_add(page_chunks.len()) > MAX_DOCUMENT_CHUNKS {
            return Err(failure(path, "Document exceeds the 256 chunk limit"));
        }
        chunks.extend(page_chunks);
    }
    Ok(chunks)
}

fn extract_pdf(
    bytes: &[u8],
    path: &Path,
) -> Result<(Vec<IndexedChunk>, Option<String>), ExtractionError> {
    let pages =
        pdf_extract::extract_text_from_mem_by_pages(bytes).map_err(|error| failure(path, error))?;
    let chunks = chunks_from_pdf_pages(&pages, path)?;
    let pending = chunks.is_empty().then(|| "ocr".to_owned());
    Ok((chunks, pending))
}

pub fn extract_document(path: &Path) -> Result<ExtractedDocument, ExtractionError> {
    let metadata = fs::metadata(path).map_err(|error| failure(path, error))?;
    if metadata.len() > MAX_SOURCE_BYTES {
        return Err(failure(
            path,
            "File exceeds the 64 MiB local extraction limit",
        ));
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|error| failure(path, error))?
        .take(MAX_SOURCE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| failure(path, error))?;
    if bytes.len() as u64 > MAX_SOURCE_BYTES {
        return Err(failure(
            path,
            "File exceeds the 64 MiB local extraction limit",
        ));
    }
    let digest = Sha256::digest(&bytes);
    let content_hash = digest
        .iter()
        .fold(String::with_capacity(64), |mut hash, byte| {
            write!(&mut hash, "{byte:02x}").expect("writing to a String cannot fail");
            hash
        });
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let (chunks, pending_enrichment) = match extension.as_str() {
        "c" | "cc" | "cpp" | "cs" | "css" | "csv" | "go" | "h" | "hpp" | "html" | "java" | "js"
        | "jsx" | "json" | "kt" | "kts" | "log" | "lua" | "md" | "markdown" | "php" | "py"
        | "rb" | "rs" | "scss" | "sh" | "sql" | "swift" | "toml" | "ts" | "tsx" | "txt" | "vue"
        | "xml" | "yaml" | "yml" => {
            if bytes.contains(&0) {
                (Vec::new(), None)
            } else {
                if bytes.len() > MAX_EXTRACTED_TEXT_BYTES {
                    return Err(failure(path, "Extracted text exceeds the 8 MiB limit"));
                }
                let text = String::from_utf8(bytes).map_err(|error| failure(path, error))?;
                (chunks_from_text(&text, "text", None, path)?, None)
            }
        }
        "docx" | "xlsx" | "pptx" => (extract_office(&bytes, path, &extension)?, None),
        "pdf" => extract_pdf(&bytes, path)?,
        "avif" | "bmp" | "gif" | "ico" | "jpeg" | "jpg" | "png" | "webp" => {
            (Vec::new(), Some("ocr".to_owned()))
        }
        "aac" | "avi" | "flac" | "m4a" | "m4v" | "mkv" | "mov" | "mp3" | "mp4" | "ogg" | "wav"
        | "webm" | "wma" | "wmv" => (Vec::new(), Some("transcription".to_owned())),
        _ => (Vec::new(), None),
    };

    Ok(ExtractedDocument {
        content_hash,
        extraction_version: "lumen-extract-v1".to_owned(),
        chunks,
        pending_enrichment,
    })
}

#[derive(Debug, thiserror::Error)]
pub enum ExtractionError {
    #[error("Could not extract {path}: {message}")]
    Failed { path: String, message: String },
}

#[cfg(test)]
mod tests {
    use std::fs::File;
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    use super::*;
    use crate::search::test_support::SearchFixture;

    #[test]
    fn extracts_utf8_text_into_bounded_chunks_with_a_content_hash() {
        let fixture = SearchFixture::new("text-extraction");
        let path = fixture.file("notes.txt", "Hello Ångström".repeat(8_000).as_bytes());

        let extracted = extract_document(&path).unwrap();
        assert_eq!(extracted.extraction_version, "lumen-extract-v1");
        assert_eq!(extracted.content_hash.len(), 64);
        assert!(extracted.chunks.len() > 1);
        assert!(
            extracted
                .chunks
                .iter()
                .all(|chunk| chunk.text.len() <= 32 * 1024)
        );
        assert_eq!(extracted.pending_enrichment, None);
    }

    #[test]
    fn extracts_office_xml_without_returning_markup() {
        let fixture = SearchFixture::new("office-extraction");
        let path = fixture.root().join("brief.docx");
        let file = File::create(&path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        archive
            .start_file("word/document.xml", SimpleFileOptions::default())
            .unwrap();
        archive
            .write_all(b"<w:document><w:p><w:t>Quarterly &amp; annual</w:t></w:p></w:document>")
            .unwrap();
        archive.finish().unwrap();

        let extracted = extract_document(&path).unwrap();
        assert_eq!(extracted.chunks.len(), 1);
        assert!(extracted.chunks[0].text.contains("Quarterly & annual"));
        assert!(!extracted.chunks[0].text.contains("<w:"));
        assert_eq!(extracted.chunks[0].extraction_kind, "office-xml");
    }

    #[test]
    fn routes_images_to_cloud_enrichment_without_exposing_binary_bytes() {
        let fixture = SearchFixture::new("image-extraction");
        let path = fixture.file("scan.png", &[0, 159, 146, 150]);

        let extracted = extract_document(&path).unwrap();
        assert!(extracted.chunks.is_empty());
        assert_eq!(extracted.pending_enrichment.as_deref(), Some("ocr"));
    }

    #[test]
    fn rejects_plain_text_beyond_the_extracted_text_budget() {
        let fixture = SearchFixture::new("oversized-text-extraction");
        let oversized = vec![b'a'; MAX_EXTRACTED_TEXT_BYTES + 1];
        let path = fixture.file("oversized.txt", &oversized);

        let error = extract_document(&path).unwrap_err();
        assert!(error.to_string().contains("8 MiB"));
    }

    #[test]
    fn rejects_office_xml_that_expands_beyond_the_decompression_budget() {
        let fixture = SearchFixture::new("office-decompression-budget");
        let path = fixture.root().join("compressed.docx");
        let file = File::create(&path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        archive.start_file("word/document.xml", options).unwrap();
        archive
            .write_all(&vec![b'a'; MAX_OFFICE_XML_BYTES as usize + 1])
            .unwrap();
        archive.finish().unwrap();

        let error = extract_document(&path).unwrap_err();
        assert!(error.to_string().contains("16 MiB"));
    }

    #[test]
    fn rejects_office_archives_with_excessive_entry_counts() {
        let fixture = SearchFixture::new("office-entry-budget");
        let path = fixture.root().join("many-entries.docx");
        let file = File::create(&path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        for index in 0..=MAX_ARCHIVE_ENTRIES {
            archive
                .start_file(
                    format!("custom/entry-{index}.xml"),
                    SimpleFileOptions::default(),
                )
                .unwrap();
        }
        archive.finish().unwrap();

        let error = extract_document(&path).unwrap_err();
        assert!(error.to_string().contains("1024 entry"));
    }

    #[test]
    fn rejects_pdf_page_and_chunk_explosion_before_indexing() {
        let fixture = SearchFixture::new("pdf-output-budgets");
        let path = fixture.root().join("hostile.pdf");
        let too_many_pages = vec![String::new(); MAX_PDF_PAGES + 1];
        assert!(
            chunks_from_pdf_pages(&too_many_pages, &path)
                .unwrap_err()
                .to_string()
                .contains("512 page")
        );

        let too_many_chunks = vec!["content".to_owned(); MAX_DOCUMENT_CHUNKS + 1];
        assert!(
            chunks_from_pdf_pages(&too_many_chunks, &path)
                .unwrap_err()
                .to_string()
                .contains("256 chunk")
        );
    }
}
