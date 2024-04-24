import React from 'react';

import { Errors } from 'cs544-js-utils';

//types defined in library.ts in earlier projects
import * as Lib from 'library-types';


import { NavLinks, LinkedResult, PagedEnvelope, SuccessEnvelope }
  from '../lib/response-envelopes.js';

import { makeLibraryWs, LibraryWs } from '../lib/library-ws.js';

type AppProps = {
  wsUrl: string
};

export function App(props: AppProps) {

  const { wsUrl } = props;

  //TODO
  
  return <>
    <ul id="errors"></ul>
    
    <form className="grid-form">
      <label htmlFor="search">Search</label>
      <span>
	<input id="search"/><br/>
	<span className="error" id="search-error"></span>
      </span>
    </form>

    <div id="result">
    { /*TODO*/ }
    </div>

   </>

}


