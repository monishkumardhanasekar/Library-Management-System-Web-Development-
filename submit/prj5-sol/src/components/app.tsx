import React, { useState, useEffect } from 'react';

import { Errors } from 'cs544-js-utils';

//types defined in library.ts in earlier projects
import * as Lib from 'library-types';


import { NavLinks, LinkedResult, PagedEnvelope, SuccessEnvelope }
  from '../lib/response-envelopes.js';

import { makeLibraryWs, LibraryWs } from '../lib/library-ws.js';
import {  makeQueryUrl } from '../lib/utils.js';

type AppProps = {
  wsUrl: string
};

export function App(props: AppProps) {

  const { wsUrl } = props;

  //TODO
  const [search, setSearch] = useState('');
  const [books, setBooks] = useState<LinkedResult<Lib.XBook>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<Lib.XBook | null>(null); // Track the selected book
  const [links, setLinks] = useState<NavLinks>({
    self: { rel: 'self', href: '', method: '' },
  });

  const [patronId, setPatronId] = useState('');
  
  
  const ws = makeLibraryWs(wsUrl);
  
  const searchBooks = async (url: URL | string) => {
    try {
      const result = await ws.findBooksByUrl(url);
      if (result.isOk === true) {
        const pagedResults = result.val;
        const { result: searchResults, links } = pagedResults;
        setBooks(searchResults);
        setLinks(links);
        
        
      } else {
        displayErrors(result.errors);
      }
    } catch (error) {
      console.error(error);
      setErrors([(error as Error).message]); // Use type assertion to ensure TypeScript knows the type of 'error'
    }
  };

  const displayErrors = (errors: { message: string }[]) => {
    setErrors(errors.map(err => err.message));
  };

  const handleSearchBlur = async () => {
    setErrors([]); // Clear previous errors
    setBooks([]); // Clear previous search results
    setSelectedBook(null); // Clear selected book details

    // Check if the search query is empty
    if (search.trim() === '') {
      setBooks([]); 
      setErrors(['Search string must specify words having two or more characters']); // Display warning message
      setSelectedBook(null);
      return; // Exit the function
    }
  
    const url = makeQueryUrl(`${wsUrl}/api/books`, { search });
    await searchBooks(url);
  };
  
  

  const handleDetailsClick = (book: Lib.XBook) => {
    setBooks([]); // Clear search results
    setSelectedBook(book); // Set the selected book to display its details
  };

  
  

  const displayScroll = (links: NavLinks) => {
    const scroll = (
      <div className="scroll">
        {links.prev && <a rel="prev" onClick={() => handleScroll(links.prev!.href)}>&lt;&lt;</a>}
        {links.next && <a rel="next" onClick={() => handleScroll(links.next!.href)}>&gt;&gt;</a>}
      </div>
    );
    return scroll;
  };

  const handleScroll = async (url: string) => {
    setErrors([]);
    await searchBooks(url);
  };






  return (
    <>
      <ul id="errors">
        {/* Display errors if they exist */}
        {errors.map((error, index) => (
          <li key={index} className="error">{error}</li>
        ))}
      </ul>
  
      <form className="grid-form">
        <label htmlFor="search">Search</label>
        <span>
          <input
            id="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={handleSearchBlur}
          />
          <br />
          <span className="error" id="search-error"></span>
        </span>
      </form>
  
      <div id="result">
        {books.length > 0 && displayScroll(links)}
        {books.length > 0 && (
        <ul id="search-results">
        {books.map((book, index) => (
        <li key={index}>
          <span className="content">{book.result.title}</span>
          <a className="details" onClick={() => handleDetailsClick(book.result)}>details...</a>
        </li>
      ))}
    </ul>
  )}
  {books.length > 0 && displayScroll(links)}
  
  
        {/* Display selected book details */}
        {selectedBook && (
          <div>
            <dl className="book-details">
              <dt>ISBN</dt>
              <dd>{selectedBook.isbn}</dd>
              <dt>Title</dt>
              <dd>{selectedBook.title}</dd>
              <dt>Authors</dt>
              <dd>{selectedBook.authors.join('; ')}</dd>
              <dt>Number of Pages</dt>
              <dd>{selectedBook.pages}</dd>
              <dt>Publisher</dt>
              <dd>{selectedBook.publisher}</dd>
              <dt>Number of Copies</dt>
              <dd>{selectedBook.nCopies}</dd>
              <dt>Borrowers</dt>
              <dd id="borrowers">None</dd>
            </dl>
          </div>
        )}
      </div>
    </>
  );  
}

