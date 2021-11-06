---
layout: post
published-on: 05 Nov 2021 05:30:00 GMT
title: Create a self-contained dynamic web component, part 1
author: Bill Chandos
description: Join me as I create a generic web component that can load and refresh dynamic contents from the backend.
tags: python,javascript,web-components,html,aiosql,jinja,jinja2,bottle
---

## Creating a self-contained dynamic web component, part 1

In the project I work on professionally, we utilize a pattern we call "dynamic widgets". Dynamic widgets are invoked in templates using a special function call that returns HTML/CSS/JS upon initial rendering, along with some special attributes and metadata so that they can be dynamically refreshed. Refreshing is triggered when a request has been made to alter the underlying data displayed within the widget and completely re-renders the dynamic widget, returns the new HTML/CSS/JS and replaces the existing content with the new content. Critically, it does this _without_ a separate, unique route in the controller, so dynamic widgets can be written and deployed as standalone units.

There are obviously many other solutions to this underlying problem: for example, you can manipulate the DOM manually for each detected change to the data, or you could use a more advanced Javascript framework to manage reactivity and state. However, the system on our project was designed with the MVC model in mind, and prior to more advanced JS frameworks being available (they still remain undesirable in our use case). Intuitively, I like the concept that the presentation and data collection logic live in one place - a template file - and that invoking a refresh will _always_ return fresh data from the database.

One requirement of our current system that limits its general usefulness is a templating language that can run arbitrary Python code (our backend is written in Python). In our case, that is Mako, and the code run in each widget is generally model methods to retrieve data from the database to be displayed. This is what guarantees fresh data, but it also locks us into specific templating languages, as well as encourages developers to mix presentation and logic in _inconsistent_ ways. 

So I set about updating this pattern to work as a [web component](https://developer.mozilla.org/en-US/docs/Web/Web_Components), using Jinja2 as a templating language and Python's bottle.py as a back-end. The goal is for the component to work with any backend and templating language, however there are architectural limitations that need resolving, as I'll discuss later.

### Web component

The web component has a number of responsibilities.
 - Accept the name of the template to load
 - Perform the initial (asynchronous) load of content from the server
 - Provide a reload method
 - Accept and pass arguments to controller on initial load and reloads

First, I will define the component class and its constructor.
```
class DynamicWidget extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const myDiv = document.createElement('div');
    shadow.appendChild(myDiv);
  }
  ...
}
```
This is standard boilerplate code from the documentation, except that I am explicitly adding a `div` element as the first (and only) child of the component. This element can be changed with an attribute (e.g. to a `span`), but I don't have access to the attributes during the construction phase.

In order to access attributes and take action upon them, I must wait for the custom element to be appended into the document-connected element, via the `connectedCallback` method.
```
connectedCallback() {
    if (this.hasAttribute('elem') && this.getAttribute('elem') !== 'div') {
      this.shadowRoot.firstChild.replaceWith(document.createElement(this.getAttribute('elem')));
    }
    this.loadInitalContents();
  }
```
To support non-`<div>` root elements, I first check if the custom element has an `elem` attribute and, if so, replace the `<div>`. This only needs to happen once. I then call the `loadInitialContents` method of the component. This method is, unsurprisingly, responsible for loading the initial contents of the widget. It is an `async` method, as it uses `fetch` to communicate with the backend, which returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) and, therefore, must be called with `await`.
```
async loadInitalContents() {
    await this._loadContents();
}
```
However, the work is actually done by the `_loadContents()` method, as the logic contained therein will later be duplicated by the reload method. The use of underscore here has no strict meaning in JavaScript, it's merely a convention to specify the method is designed to be called by other methods, not consumed directly.
```
async _loadContents() {
    this.loadingAnimation();
    const dwName = this.getAttribute('name');
    ...
```
I will return to `loadingAnimation()` - likely in a later blog post - but suffice to say its purpose is to provide user feedback of loading/reloading state and prevent interaction with soon-to-be replaced elements. Next, prepare the server request, passing all the element's `data-` attributes as arguments using the spread operator and `dataset`. 

```
    const root = this.shadowRoot.firstChild;
    const args = { ...this.dataset }
    const url = new URL('/dynamic-widget', BASE_URL);
    url.searchParams.append('name', dwName);
    for (let k of Object.getOwnPropertyNames(args)) {
      url.searchParams.append(k, args[k]);
    }
    const response = await fetch(url);
```
Note that a `POST` request would allow transmitting the arguments as JSON in the body of the request. However, I am not requesting a change on the server, I am requesting data from the server, which is what a `GET` request is for. So, instead, I am adding the arguments as search parameters to the URL. This brings up an interesting issue with argument data types that I'll discuss later.

If the request is successful, the server will return JSON. The `newBody` value of that object will contain the HTML to be added to the element - i.e. the rendered contents of the widget. 

```
    const initContents = await response.json();
    root.innerHTML = initContents.newBody;
```

If I expect only HTML and CSS returned from the server, I could finish here:
```
    root.innerHTML = initContents.newBody;
    this.clearLoading();
```

However, a valid template could have Javascript contained within. Javascript [does not automatically execute when added via this method](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML#security_considerations). This is a reasonable security limitation, but I trust my own content returned from the server and expect Javascript to run. I can get around this by parsing the returned HTML for `<script>` tags, creating `<script>` elements, and appending them to the root of the custom element.
```
  const re = /<script[\s\S]*?>([\s\S]*?)<\/script>/gi;
  const matches = initContents.newBody.matchAll(re);
  for (let match of matches) {
    const code = match[1].trim();
    const scriptTag = document.createElement('script');
    scriptTag.textContent = code;
    root.appendChild(scriptTag);
  }
```
The regular expression matches opening and closing `<script>` tags, and creates a group for its contents, so they can be added to the `script` element using `textContent`. It is possible there are multiple `<script>` tags in the returned HTML, so I iterate over the matches.

There are some further subtleties here that we need to address. The Javascript should execute _after the new HTML contents is inserted_, as it very likely relies upon it. This could be a source of sneaky bugs as I would have _new JS_ running against _old HTML_ right before replacing the HTML. So I will insert `root.innerHTML = initContents.newBody;` before the `<script>` processing code.

However, this creates a minor ergonomics issue: the Javascript now appears twice in the source as can be seen in the document inspector. This can easily be avoided because Javascripts `String.prototype.replace()` method accepts a regular expression as its first argument.

```
  ...
  const re = /<script[\s\S]*?>([\s\S]*?)<\/script>/gi;
  root.innerHTML = initContents.newBody.replace(re, '');
  const matches = initContents.newBody.matchAll(re);
  ...
```
### Lessons and next steps

I now have a custom element that is capable of loading its contents asynchronously from the server. Next I need to add dynamic reloading by implementing a method of the web component and a general purpose route in the controller. Stay tuned for part 2 ... and beyond!

