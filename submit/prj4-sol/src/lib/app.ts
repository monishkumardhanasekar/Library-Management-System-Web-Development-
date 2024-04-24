import { Errors } from 'cs544-js-utils';

//types defined in library.ts in earlier projects
import * as Lib from 'library-types';


import { NavLinks, LinkedResult, PagedEnvelope, SuccessEnvelope }
  from './response-envelopes.js';

import { makeLibraryWs, LibraryWs } from './library-ws.js';

import { makeElement, makeQueryUrl } from './utils.js';

export default function makeApp(wsUrl: string) {
  return new App(wsUrl);
}

interface SearchResult {
  isOk: boolean;
  status: number;
  links: any; 
  result: any[]; 
}

class App {
  private readonly wsUrl: string;
  private readonly ws: LibraryWs;

  private readonly result: HTMLElement;
  private readonly errors: HTMLElement;
  private readonly search: HTMLInputElement;

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
    this.ws = makeLibraryWs(wsUrl);
    this.result = document.querySelector('#result');
    this.errors = document.querySelector('#errors');
    //TODO: add search handler
    this.search = document.querySelector("#search") as HTMLInputElement;
    this.search.addEventListener('blur', this.searchFieldBlurHandler.bind(this));
  }
  
  //TODO: add private methods as needed

  //HANDLER FUNCTIONS: 
  private searchFieldBlurHandler() {
    try {
        const fetchURL = makeQueryUrl(this.wsUrl + '/api/books', { search: this.search.value });
        // Call the method to fetch search results using the constructed URL
        this.searchQueryResults(fetchURL);
    } catch (error) {
        // Handle the error here, you can log it or perform any other action
        console.error('An error occurred while processing the search:', error);
    }
}

private checkoutHandler(isbn: string, e: Event) {
  e.preventDefault();

  const patronIdInput = document.getElementById('patronId') as HTMLInputElement;
  const patronId = patronIdInput.value.trim();
}

private handleReturnBook(isbn: string, patronId: string) {
  this.ws.returnBook({ isbn, patronId })
      .then(async (returnResult) => {
          if (returnResult.isOk) {
              await this.renderBorrowersList(isbn); 
          } else {
              this.unwrap(returnResult); 
          }
      })
      .catch((error) => {
          this.unwrap(error); 
      });
}

//Displaying and formatting functions
  
private displayBookDetails(book: Lib.Book) {
  clearElement(this.result); 

  const dl = this.createDetailsList(book);
  this.appendDetailsAndCheckoutForm(dl, book.isbn);
}

private renderResults(obj: SearchResult) {
  // Extract book links and list from the search result object
    const bookLinks = obj.links;
    const bookList = obj.result;
    clearElement(this.result); 

    // Build and append the scroll up button
    const scrollUpButton = this.buildScrollNavigator(bookLinks);
    this.result.appendChild(scrollUpButton);
    const ul = makeElement('ul', { id: 'search-results' });

    // Iterate over each book and construct the HTML
    for (const index in bookList) {
      if (Object.prototype.hasOwnProperty.call(bookList, index)) {
          const book = bookList[index];
          // Construct HTML for the book
          const bookHtml = this.constructBookHtml(book);

          // Append the HTML for the book to the UL element
          ul.appendChild(bookHtml);
      }
  }
    this.result.appendChild(ul);
    const scrollDownButton = this.buildScrollNavigator(bookLinks);
    this.result.appendChild(scrollDownButton);
}

private async renderBorrowersList(isbn: string) {
  try {
      const result = await this.ws.getLends(isbn);
      const borrowersDiv = document.getElementById('borrowers') as HTMLElement;
      clearElement(borrowersDiv); 
      if (result.isOk) {
          if (result.val.length > 0) {
              this.handleSuccessfulResult(result.val, borrowersDiv, isbn);
          } else {
            borrowersDiv.textContent = 'None';
          }
      } else {
          this.handleError(result);
      }
  } catch (error) {
      this.handleError(error);
  }
}

private buildScrollNavigator(links: NavLinks): HTMLElement {
  // Create a container div for the scroll navigator
  const div = makeElement('div', { class: 'scroll' });
  // Function to create a link element with event listener for navigation
  const createLink = (rel: string, text: string, href: string) => {
      const link = makeElement('a', { rel }, text);
      link.addEventListener('click', (event) => {
          event.preventDefault();
          this.searchQueryResults(href);
      });
      return link;
  };

  // Function to append a link element to the navigator div
  const appendLink = (rel: string, text: string, href: string) => {
      const link = createLink(rel, text, href);
      div.appendChild(link);
  };

  links.prev && appendLink('prev', '<<', links.prev.href);
  links.next && appendLink('next', '>>', links.next.href);

  return div;
}


private async onClickDetails(url: string) {
  this.ws.getBookByUrl(url)
      .then((result) => {
          //console.log("Result:", result);
          if (result.isOk) {
              this.displayBookDetails(result.val.result);
          } else {
              this.unwrap(result);
          }
      })
      .catch((error) => {
          console.error(error); 
      });
}


private createDetailsList(book: Lib.Book): HTMLElement {
  const details = [
    { label: 'ISBN', value: book.isbn || 'N/A' },
    { label: 'Title', value: book.title || 'N/A' },
    { label: 'Authors', value: (book.authors && book.authors.join('; ')) || 'N/A' },
    { label: 'Number of Pages', value: (book.pages && book.pages.toString()) || 'N/A' },
    { label: 'Publisher', value: book.publisher || 'N/A' },
    { label: 'Number of Copies', value: (book.nCopies && book.nCopies.toString()) || 'N/A' },
    { label: 'Borrowers', value: 'None', id: 'borrowers' }
  ];

  const dl = makeElement('dl', { class: 'book-details' });

  details.forEach(detail => {
    const dt = makeElement('dt', {}, detail.label);
    const dd = makeElement('dd', { id: detail.id }, detail.value);
    dl.appendChild(dt);
    dl.appendChild(dd);
  });

  return dl;
}

private constructBookHtml(book: any): HTMLElement {
  const spanElement = makeElement('span', { class: 'content' }, book.result.title);
  const linkElement = makeElement('a', { class: 'details' }, 'details...');
  linkElement.addEventListener('click', (e) => {
      e.preventDefault(); 
      this.onClickDetails(book.links.self.href); 
  });
  const li = makeElement('li', {}, spanElement, linkElement);
  return li;
}

private async checkoutForm(isbn: string) {
  const form = makeElement('form', { class: 'grid-form' });
  await this.renderBorrowersList(isbn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();  

    const patronId = (document.getElementById('patronId') as HTMLInputElement).value.trim();
    this.clearErrors();  

    try {
      const result = await this.ws.checkoutBook({ isbn, patronId });
      if (result.isOk) {
        await this.renderBorrowersList(isbn);
      } else {
        this.unwrap(result);
        throw new Error("Checkout failed");
      }
    } catch (error) {
      console.error(error);
    }
  });

  const formElements = this.createCheckoutFormElements();
  this.appendFormToContainer(form, formElements);
}


private appendDetailsAndCheckoutForm(detailsList: HTMLElement, isbn: string) {
  this.result.appendChild(detailsList); 
  this.checkoutForm(isbn); 
}

private appendFormToContainer(form: HTMLElement, formElements: any) {
  form.appendChild(formElements.label);
  form.appendChild(makeElement('span', {}, formElements.box, makeElement('br'), formElements.button));

  this.result.appendChild(form);
}

private async searchQueryResults(url: string | URL) {
  this.clearErrors();

  const result = await this.ws.findBooksByUrl(url);
  console.log("Results: ", result);

  if (result.isOk) {
      this.renderResults(result.val);
  } else {
      clearElement(this.result);
      this.unwrap(result); 
  }
}


private createCheckoutFormElements() {
  // Create a label element for the Patron ID input field
  const label = document.createElement('label');
  label.setAttribute('for', 'patronId');
  label.textContent = 'Patron ID';

  // Create an input element for the Patron ID with appropriate attributes
  const input = document.createElement('input');
  input.id = 'patronId';
  input.type = 'text';
  input.name = 'patronId';

  // Create a span element to display error messages related to the Patron ID input
  const errorSpan = document.createElement('span');
  errorSpan.classList.add('error');
  errorSpan.id = 'patronId-error';

  // Create a container span to hold the input field and error message span
  const box = document.createElement('span');
  box.appendChild(input);
  box.appendChild(document.createElement('br'));
  box.appendChild(errorSpan);

  // Create a button element for submitting the checkout action
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Checkout Book';

  return { label, box, button };
}




private handleSuccessfulResult(lends: any[], borrowersElement: HTMLElement, isbn: string) {
   // Create a new unordered list element
  const ul = document.createElement('ul');
  // Iterate over each lend object
  lends.forEach(lend => {
    const li = document.createElement('li');
    // Create a span element to display the patron ID
    const span = {
      element: document.createElement('span'),
      className: 'content',
      textContent: lend.patronId 
    };
    span.element.className = span.className;
    span.element.textContent = span.textContent;
    li.appendChild(span.element);
// Create a button element for returning the book
    const button = {
      element: document.createElement('button'),
      className: 'return-book',
      textContent: 'Return Book'
    };
    button.element.className = button.className;
    button.element.textContent = button.textContent;
    // Attach onclick event handler to the button element
    button.element.onclick = () => this.handleReturnBook(isbn, lend.patronId); 
    li.appendChild(button.element);

    ul.appendChild(li);
  });
  borrowersElement.appendChild(ul);
}

private handleError(error: any) {
  this.unwrap(error); // Handle errors
}


  /** unwrap a result, displaying errors if !result.isOk, 
   *  returning T otherwise.   Use as if (unwrap(result)) { ... }
   *  when T !== void.
   */
  private unwrap<T>(result: Errors.Result<T>) {
    if (result.isOk === false) {
      displayErrors(result.errors);
    }
    else {
      return result.val;
    }
  }

  /** clear out all errors */
  private clearErrors() {
    clearElement(this.errors)
    document.querySelectorAll(`.error`).forEach( el => {
      el.innerHTML = '';
    });
  }

} //class App

/** Display errors. If an error has a widget or path widgetId such
 *  that an element having ID `${widgetId}-error` exists,
 *  then the error message is added to that element; otherwise the
 *  error message is added to the element having to the element having
 *  ID `errors` wrapped within an `<li>`.
 */  
function displayErrors(errors: Errors.Err[]) {
  for (const err of errors) {
    const id = err.options.widget ?? err.options.path;
    const widget = id && document.querySelector(`#${id}-error`);
    if (widget) {
      widget.append(err.message);
    }
    else {
      const li = makeElement('li', {class: 'error'}, err.message);
      document.querySelector(`#errors`)!.append(li);
    }
  }
}

//TODO: add functions as needed
function clearElement(element: HTMLElement) {
  element.innerHTML = '';
}
