---
layout: post
published-on: 13 Jun 2021 00:00:00 GMT
title: Add post tagging and recommendations to the blog
author: Bill Chandos
description: Join me as I add a tagging and post recommendation system to my static blog generator.
tags: blog,markdown,node,nodejs
---

## Adding post tags and recommendations to the static blog generator

In a [recent post]('/blog/building_a_static_blog.html') I covered writing a rudimentary static blog generator using NodeJS and Markdown.

In addition to basic next and previous post navigation, I'd also like to add tag-based recommendations. For example, this blog post may be tagged with keywords like "blog", "markdown", "nodejs" and at the bottom, I'd like to recommend other posts that share some or all of those tags.

I only have access to the markdown metadata in the first iteration over the Markdown files, so I'll parse it and add as an array to the post object.

```
post.tags = metadata.tag.split(',');
```

Now, the tagging system has no inherent structure. It is just keywords that I have thought to add to the post metadata. It's not drawn from a common dictionary, nor are there minimums, limits, or other rules applied. Given this relative lack of sophistication, I'm going to start with a rather naïve approach: for each post, I'm going to loop through its array of tags, comparing tag frequency with every *other* post, noting the number of common tags, and then picking the top two or three posts based on that figure. Given the multiple iterations per post, I expect this will begin to perform poorly as the number of posts grows. But, as I write this, there are exactly two other blog posts and so I will manage performance degradation as it starts to reveal itself.

Since I am looking for similarity between an array of strings, I first thought of using sets. Sadly, Javascript does not provide native intersection or union operations for sets, so using a set would only gain deduplication. That's not very useful when I am the one writing the tags. I just have to remember to not type the same tag twice.

Here's a code snippet I found on StackOverflow:

```
const intersection = array1.filter(element => array2.includes(element));
```

But I need this to operate on all other posts.

```
for (let otherPost of postArray.filter(p => p !== post)) {
    const intersection = post.tags.filter(t => otherPost.tags.includes(t));
}
```

Note I am filtering the `postArray` prior to iterating so I do not compare a post to itself, thereby recommending a post someone has just read.

Interestingly, I don't actually need to know which tags overlap (for now). I just need to know how many.

```
const tagCount = post.tags.filter(t => otherPost.tags.includes(t)).length;
```

Within this loop, I lack the context to make any decisions about whether `otherPost` should be included on `post`s page, so I should push our value to another array for later comparison. I'll also need a reference to the other post, but unfortunately the blog posts to not have unique IDs. I could use the array index ... but I've messed that up by filtering the array before iteration!

Time to go full blockhead:

```
let recommendationArray = [];
for (let [idx, otherPost] of postArray.entries()) {
    if (post !== otherPost) {
    const tagCount = post.tags.filter(t => otherPost.tags.includes(t)).length;
    recommendationArray.push({idx, tagCount});
    }
}
```

Note, I'm using ES2015 shorthand property names in the object that is added to the array.

So now I have an array of objects for every other post but the current post that includes its index within `postArray` as well as how many tags the two posts have in common. There are many ways to process this data. For my purpose, I think that I will want no more than 2 recommended posts, and recommended posts must have at least 1 tag in common.

I'll begin by removing all items with a `tagCount` of 0, and then sort.

```
recommendationArray = recommendationArray.filter(r => r.tagCount !== 0);
recommendationArray.sort((a, b) => b.tagCount - a.tagCount);
```

To get the top two values, I will use `.slice()`. This works because `.slice()` will not fail if there are fewer elements in the array than requested. It will even work on an empty array.

```
let topTwo = recommendationArray.slice(0, 2);
```

Now it's time to generate the appropriate HTML for each of the recommended posts.

```
let recString = '';
for (let { idx } of topTwo) {
    const recommendedPost = postArray[idx];
    recString += `<li><a href="${recommendedPost.fileName}">${recommendedPost.title}</a></li>`
}
```

I use object destructuring to extract only the `idx` value, as the tagCount is irrelevant (this will not be exposed to the user). Looking back on this code, I realize that using the index is probably unecessary: I need the post's `fileName` and `title` only, why not just write those directly to the array? This seems clearer, and also allows me to go back to filtering `postArray` in the loop constructor.

```
for (let otherPost of postArray.filter(p => p !== post)) {
...
recommendationArray.push(
    {
        tagCount, 
        fileName: otherPost.fileName, 
        title: otherPost.title
    }
);
...
for (let { fileName, title } of topTwo) {
    recString += `<li><a href="${fileName}">${title}</a></li>`
}
```

Finally, I'll wrap the string concatenation in an `if` statement, so that the recommendation section does not appear if there are no recommended blog posts.

```
if (topTwo.length > 0) {
    ...
}
```

### Lessons and next steps

There was nothing particularly novel or challenging about this. It consists of fairly standard programming tasks and builds upon much of the previous work.

I am noticing, however, that the primary loop that iterates over all the collected blog posts is getting rather long. I will explore whether it makes sense to refactor this, or whether it's time to consider a proper templating engine.