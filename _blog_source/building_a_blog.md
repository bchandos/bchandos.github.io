---
layout: post
published-on: 01 Jun 2021 00:00:00 GMT
title: Building a Static Blog Generator
author: Bill Chandos
tags: nodejs,node,github,blog,markdown
---

## Building a Static Blog Generator for Github Pages Using Node JS

If you're reading this, you are on my Github Pages site. For a few years, this was only a static portfolio website with project showcases and contact information.

When I decided to start blogging, I wanted to leverage the existing site. Github Pages uses Jekyll static site generator as its back-end, so I could have simply launched a Jekyll site. However, I wanted the main page to remain as a portfolio, and keep the blog sequestered in its own subdirectory and/or subdomain.

I looked into various pre-built options, but found most of them far too complex for my basic needs. Which are:
- Compatible with existing Github Pages (therefore, static)
- Integrate with existing site theme (Miniport by HTML5 UP)
- Markdown for blog content
- Auto-generate blog index, and post page navigation (i.e. Next, Previous)

I decided on using NodeJS in my development environment to process the markdown files into static HTML. I could have easily done this in Python, or another basic interpreted language, but wanted to gain further Node experience beyond Express. Actually, I kinda like Javascript! ¯\\\_(ツ)_/¯  

Essentially, I am writing a rudimentary static site generator.

The first step was ensuring that my build tools and original markdown files will not be exposed to the web. Github Pages (or, more precisely, Jekyll) has a useful feature for doing just this: prepend your directory or file with an underscore. I began by creating `_blog_source/` in the root directory. 

Within this folder I created `base.html` which contains the primary layout page HTML. It is nearly identical to the `index.html` that powers the main page, but with the center two sections removed, replaced with an empty `<article>` element. In this element (nested within a few divs for formatting), I added the text: `###BLOG#CONTENT###`

At this point, you may be thinking "why not just use a templating engine?" A valid question: there are numerous highly capable templating engines for NodeJS. In this case, I don't feel my needs are sophisticated enough to require a full templating engine and its dependencies. A simple `String.replace()` will suffice. I may change this in the future, should my design become more complex and I encounter specific use cases best served by a fully-featured templating engine.

Next I created the `blog/` directory that will serve as that path for my index and posts. Navigating to this path should present a list of blog posts in chronological order, linking to the individual HTML files.

Finally, I create `_genblog.js` in the root directory (which will also be ignored by Jekyll/Github) that will contain the code to process markdown files in `_blog_sources/` and convert them to HTML in `blog/`. This will be run from my project directory prior to pushing:

```
$ node _genblog.js
```

*(I may look into adding this to the Github Pages build process, but one step at a time...)*

Now onto the code. I won't post everything, as the entire up-to-date codebase is available [here](https://github.com/bchandos/bchandos.github.io). But I will breakdown the structure and explain my thinking.

I will be doing file reading and writing, and so Node's `fs` is perfect for the job, and included in the base installation. I do need a markdown parser, and for that I chose [showdown](https://github.com/showdownjs/showdown), primarily because it has a documented metadata parser. This means I can include things like full post title, publication date, and tags to each document and use that data to generate the appropriate files with standardized filenames. But that's it for dependencies!

First I need to gather all of the available markdown files in the `_blog_source/` directory. I am using `async/await` because ... I just like it. 👍

```
const markDownFileNames = async () => {
  const allFiles = await fs.readdir('./_blog_source');
  return allFiles.filter(fileName => fileName.endsWith('.md'));
}
```

As you can see, I'm using `fs.readdir()` to asynchronously get all files from our source directory. `readdir` returns an array, and because the `base.html` template file is in the directory, I need to filter for markdown files. I am doing nothing more than checking the file extension, but since this is my website I'm trusting myself to be a good citizen &#128556;.

Before I generate the files, I want to clear all the contents of the blog directory. While any blog posts with the same title + the index will just write over their previous versions, if I change the file or delete a post, I don't want abandoned files to persist.

```
const clearBlogDirectory = async () => {
  const allFiles = await fs.readdir('./blog');
  for (let file of allFiles) {
    await fs.unlink(`./blog/${file}`);
  }
}
```

This uses two `fs` methods: `readdir` (used previously) and `unlink`, which is a deletion method. I use a for loop instead of using `Array.forEach()` because, well, I came to Node from Python and I just like `for` loops, ok? *(A refinement here would be to add the `path` library and use `path.join()` to generate the string passed to `unlink`, but it doesn't feel necessary for this simple function.)*

Two more useful functions, `generateFilenameFromTitle()` and `insertData()`, you can view in the source. Now down to the generator itself...

I am going to break this up a bit, because there are multiple steps occuring in parallel - the generating of individual blog posts, and the assembly of the index page - and it's easier to view them separately, as that is how I coded them. Our main function:

```
const generate = async () => {
  await clearBlogDirectory();
  const mdFiles = await markDownFileNames();
  ...
}
  ```

First, clear the blog directory and gather the names of all our source markdown files.

```
for (let mdFile of mdFiles) {
    const mdContents = await fs.readFile(`./_blog_source/${mdFile}`);
    const html = converter.makeHtml(mdContents.toString());
    const metadata = converter.getMetadata();
    ...
}
```

After declaring some variables, begin iterating over the markdown files. `converter()` is provided by `showdown` and converts the markdown to html. After conversion, grab the metadata from the top of the markdown.

```
    ...
    let post = {}
    post.title = metadata.title;
    post.fileName = fileName;
    post.publishDate = date;
    post.html = html;
    postArray.push(post);
    ...
```

Next, we place the useful bits into an object, and push that object to an array. This is needed because I want the posts to be sorted by publication date for building the index. Like this:

```
postArray.sort((a, b) => a.publishDate < b.publishDate ? 1 : -1);
```

```
for (let [idx, post] of postArray.entries()) {
    const nextPost = postArray[idx - 1] ? `<a href="${postArray[idx - 1].fileName}">${postArray[idx - 1].title}</a> &#8640;` : '';
    const prevPost = postArray[idx + 1] ? `&#8637; <a href="${postArray[idx + 1].fileName}">${postArray[idx + 1].title}</a>` : '';
    post.html += `<div id="blog-footer"><div>${prevPost}</div> <div>${nextPost}</div></div>`;
    const blogContent = await insertData(post.html);
    await fs.writeFile(`./blog/${post.fileName}`, blogContent);
}
```

Now, iterate over the sorted posts. The first few lines of code generate a link to the previous and next posts, if they exist (i.e. we are not at the first or last element of the array). Add these to a `<div>` and append to the post's html before writing to file. The `<div>` will always be present, but will be empty if there are no other posts but the current. Finally, insert the HTML into `base.html` and write it to file with our generated filename. 

That's it! Well, except for our index...

```
let indexContent = '<h3>Posts</h3><ul>';
```

At the top of our `generate` function, we declared this variable and added a header and an opening unordered list tag.

```
post.indexContent = `
    <li>
      <h4>
        <a href="/blog/${fileName}">
          ${metadata.title}</a>
        <em> &mdash; ${dateString}</em>
      </h4>
    </li>`
```

In the first loop, we create a list element with a link to the blog post, and add it to the post's content. Again, we are saving it to the array so it can be sorted and appear in the index in chronological order.

```
  for (let [idx, post] of postArray.entries()) {
    indexContent += post.indexContent;
   ...
  }
  indexContent += '</ul>'
  const finalTemplate = await insertData(indexContent);
  await fs.writeFile('./blog/index.html', finalTemplate);
```

Finally, add the post's index list element to the string as they are iterated in order. After, close the unordered list tag, insert the header and list into the base template, and write to file.

And that's it! If you're reading this, it works!

### Lessons and next steps

I enjoyed putting this project together. Although not terribly complex, it was useful for me to think about how templating systems work, and to use built-in Node functions in a way that I would have in Python. One of Node's strength is the package library, but it can be helpful to explore the standard library and understand how those packages are built.

As a follow-up, I want to implement post tagging so I can show related posts under the current post. I will also need to add more specificity to the filename generator should two posts have the same three words at the start of their title.