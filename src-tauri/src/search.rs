use tantivy::schema::*;
use tantivy::{Index, IndexReader, ReloadPolicy, Term, IndexWriter};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use crate::models::SearchResult;

pub struct SearchService {
    index: Index,
    schema: Schema,
    reader: IndexReader,
    query_parser: QueryParser,
}

impl SearchService {
    pub fn new(data_dir: &PathBuf) -> Result<Self> {
        // Create search index directory
        let search_dir = data_dir.join("search");
        fs::create_dir_all(&search_dir)?;
        
        // Define schema
        let mut schema_builder = Schema::builder();
        
        let title = schema_builder.add_text_field("title", TEXT | STORED);
        let content = schema_builder.add_text_field("content", TEXT | STORED);
        let tags = schema_builder.add_text_field("tags", TEXT | STORED);
        let _date = schema_builder.add_text_field("date", TEXT | STORED);
        let _start_minutes = schema_builder.add_i64_field("start_minutes", INDEXED | STORED);
        let _duration_minutes = schema_builder.add_i64_field("duration_minutes", INDEXED | STORED);
        let _time_block_id = schema_builder.add_i64_field("time_block_id", INDEXED | STORED);
        
        let schema = schema_builder.build();
        
        // Create or open index
        let index = if search_dir.join("meta.json").exists() {
            Index::open_in_dir(&search_dir)?
        } else {
            Index::create_in_dir(&search_dir, schema.clone())?
        };
        
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;
        
        // Create query parser
        let query_parser = QueryParser::for_index(&index, vec![title, content, tags]);
        
        Ok(SearchService {
            index,
            schema,
            reader,
            query_parser,
        })
    }
    
    pub fn index_time_block(&self, time_block: &crate::models::TimeBlock, content: &str) -> Result<()> {
        let mut writer: IndexWriter<BTreeMap<Field, OwnedValue>> = self.index.writer(50_000_000)?;
        
        let title = self.schema.get_field("title").unwrap();
        let content_field = self.schema.get_field("content").unwrap();
        let tags = self.schema.get_field("tags").unwrap();
        let date = self.schema.get_field("date").unwrap();
        let start_minutes = self.schema.get_field("start_minutes").unwrap();
        let duration_minutes = self.schema.get_field("duration_minutes").unwrap();
        let time_block_id = self.schema.get_field("time_block_id").unwrap();
        
        let mut doc = BTreeMap::new();
        doc.insert(title, OwnedValue::Str(time_block.title.clone()));
        doc.insert(content_field, OwnedValue::Str(content.to_string()));
        doc.insert(tags, OwnedValue::Str(time_block.tags.join(" ")));
        doc.insert(date, OwnedValue::Str(time_block.date.clone()));
        doc.insert(start_minutes, OwnedValue::I64(time_block.start_minutes as i64));
        doc.insert(duration_minutes, OwnedValue::I64(time_block.duration_minutes as i64));
        
        if let Some(id) = time_block.id {
            doc.insert(time_block_id, OwnedValue::I64(id));
        }
        
        writer.add_document(doc)?;
        writer.commit()?;
        
        Ok(())
    }
    
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let searcher = self.reader.searcher();
        
        let query = self.query_parser.parse_query(query_str)?;
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;
        
        let title = self.schema.get_field("title").unwrap();
        let content_field = self.schema.get_field("content").unwrap();
        let tags = self.schema.get_field("tags").unwrap();
        let date = self.schema.get_field("date").unwrap();
        let start_minutes = self.schema.get_field("start_minutes").unwrap();
        let duration_minutes = self.schema.get_field("duration_minutes").unwrap();
        let time_block_id = self.schema.get_field("time_block_id").unwrap();
        
        let mut results = Vec::new();
        
        for (score, doc_address) in top_docs {
            let doc: BTreeMap<Field, OwnedValue> = searcher.doc(doc_address)?;
            
            let result = SearchResult {
                id: doc.get(&time_block_id)
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
                title: doc.get(&title)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                content: doc.get(&content_field)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                date: doc.get(&date)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                start_minutes: doc.get(&start_minutes)
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32,
                duration_minutes: doc.get(&duration_minutes)
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32,
                tags: doc.get(&tags)
                    .and_then(|v| v.as_str())
                    .map(|t| t.split_whitespace().map(String::from).collect())
                    .unwrap_or_default(),
                score,
                highlights: vec![], // TODO: Add highlighting
            };
            
            results.push(result);
        }
        
        Ok(results)
    }
    
    pub fn delete_time_block(&self, time_block_id: i64) -> Result<()> {
        let mut writer: IndexWriter<BTreeMap<Field, OwnedValue>> = self.index.writer(50_000_000)?;
        let time_block_id_field = self.schema.get_field("time_block_id").unwrap();
        
        let term = Term::from_field_i64(time_block_id_field, time_block_id);
        writer.delete_term(term);
        writer.commit()?;
        
        Ok(())
    }
}