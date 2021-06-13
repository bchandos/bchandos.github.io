---
layout: post
published-on: 06 Jun 2021 00:00:00 GMT
title: Adding an RSS feed to the statically generated blog
description: Join me as I add an RSS feed to my statically generated blog.
author: Bill Chandos
tags: blog,node,nodejs,rss,xml
---

## Adding an RSS feed to this statically generated blog

I've always been a fan of the good old RSS feed. I appreciate the simplicity and open standard, allowing for choice and developer creativity. Unfortunately, RSS news feeds have been supplanted in recent years by algorithmically driven social feeds like Twitter, Facebook, and reddit.

In my quest to escape the dark patterns and overall negative energy of those feeds, I've returned to using [my own RSS feed reader](https://github.com/bchandos/rss_feed) to consume news content. I built this as my introduction to learning Flask three years ago. It's basic, but works, and is a good tool for tinkering.

With Google [recently announcing](https://blog.chromium.org/2021/05/an-experiment-in-helping-users-and-web.html) a return of sorts for RSS, I figured it would be a good time to add a feed to my statically generated blog.

Because this site is statically generated (i.e. there is a "build" step) the XML file can just be included in that process as another output.

There are a number ways I could approach this:
- Build the XML file as a string, directly in Javascript;
- Build the XML with a general-purpose templating engine, like [`handlebars`](https://www.npmjs.com/package/handlebars), or [`ejs`](https://www.npmjs.com/package/ejs);
- Use a purpose built library, like [`rss`](https://www.npmjs.com/package/rss).

Option one is the most similar to what I am already doing, so I'll start with that. Option two seems like overkill, although if I decide to integrate templating for the entire blog, I can return to it. I'll explore option three should I get frustrated with the doing things the hard way.

First I'll need to create a base template, similar to `base.html` that will contain the basic structure of the RSS. I will name this `base_rss.xml`.

```
<?xml version="1.0" ?>
<rss version="2.0">
    <channel>
        <title>billchandos.dev blog</title>
        <link>https://billchandos.dev/blog</link>
        <description>
            Development focused blog written by Bill Chandos, 
            software developer.
        </description>
        <language>en-us</language>
        ###ITEMS###
    </channel>
</rss>
```

I will work on more details later, but for now notice I've again marked where dynamic content should be inserted using the "three hashes" method (he doesn't know how to use the three hashes?!? HA HA HA!).

Next, in `_genblog.js` (see the original "Building a blog..." post), I can update `insertData()` to operate on multiple template files with different insertion markers.

```
const insertData = async (templateName, templateData, key) => {
  const baseHtml = await fs.readFile(`./_blog_source/${templateName}`);
  const baseString = baseHtml.toString();
  return outString = baseString.replace(key, templateData);
}
```

This still assumes the template files are all in the same location, but is otherwise more robust than the prior version, which accepted only `templateData` and hardcoded all other values.

Of course, I need to update calls to this function:

```
const blogContent = await insertData('base.html', post.html, '###BLOG#CONTENT###');
```

Now it's as simple as creating the `<item>` element within the markdown loop. (Remember that we're adding post content to an object because we need to sort the array by date after the file processing loop.)

```
    post.rssContent = `
    <item>
      <title>${metadata.title}</title>
      <link>https://billchandos.dev/blog/${fileName}</link>
      <description>A great blog post</description>
      <pubDate>${metadata['published-on']}</pubDate>
      <guid>https://billchandos.dev/blog/${fileName}</guid>
    </item>
    `;
```

Note that we use the date directly from metadata, as it is already in the correct format for RSS feeds. Lucky.

One thing that is missing is a useful description and/or content preview. But I'll come back to that.

Finally, I can write out an `rss.xml` file using the modified `insertData()` function, similar to how `index.html` is created.

```
  const finalRss = await insertData('base_rss.xml', rssContent, '###ITEMS###');
  await fs.writeFile('./blog/rss.xml', finalRss);
```

And that's all I need to generate the basic RSS feed. Circling back to the description, this should likely be included in our markdown metadata as it can not easily be derived from the contents, and may be useful for other purposes. That allows me to do this:

```
<description>${metadata.description}</description>
```

### Lessons and next steps

RSS feeds are very cool and you should use them.

Next, I would like to add `<category>` tags to each item, based on the existing tag metadata. I will do this when I build out the tagging recommendation system.