---
layout: post
published-on: 08 Feb 2022 06:00:00 GMT
title: On failure and finishing the job... Part 3 of dynamic widget
author: Bill Chandos
description: In trying to create a working demo of dynamic widgets, I discovered several issues! Join me as I attempt to address them.
tags: python,javascript,web-components,html,aiosql,jinja,jinja2,bottle
---

## Creating a self-contained dynamic web component, part 3

In [part 2 of this series](/blog/adding_a_controller_for.html) I built the server side functionality for the "dynamic widget" web component. It all looked good ... in my code editor. I concluded that post by stating I would implement a working demo, and that's when the problems started.

Bugs are routine, of course, but building a demo revealed several fundamental design flaws with no obvious solutions. Here I will catalog those flaws and work through their potential solutions, and hopefully we all learn something along the way. If that thing happens to be "don't start a series of blog posts about a really swell idea until you've proven it out", well, so be it.

### Preamble

My working demo is a very (very!) simple single page to catalog books: a form to enter the title, author, and year of a book; a dynamic widget containing the list of books. The demo has no persistent database, so I'm just loading a list of books from JSON data to populate an in-memory `sqlite` database. The dynamic widget has a single query at the top for getting the list of all books.

### Problem 1: Multiple queries

Anything calling itself "dynamic" should be able to respond to changing parameters. In the case of a book catalog, search is a pretty basic function. A query that searches the books might also look quite a bit different than a query that returns all books:

```
select * from books;
```

vs.

```
select * from books
where title like '%' || :title || '%'
and author like '%' || :author || '%'
and year like '%' || :year || '%';
```

You'd be correct in observing that the second query _will_ work to return all books _if given blank values for all required parameters._ In this demo app, with a few dozen books, that works great! However, SQL `like` comparisons are not free. On large datasets, it is desireable to optimize SQL. In general though, I want to support multiple queries.

My first solution for this problem is to, essentially, use the provided parameters to determine which query to run. These are defined in the query `args` parameter (covered in part 2). This imposes a limitation that no two queries can expect the same set of arguments. Will this be a problem?

To accomplish this, I add the following conditional to the `load_sql_from_template()` function covered in part 2:

```
if set(q_args) != set(expected_args):
    # In the case that the expected arguments are not provided
    # do not execute query 
    continue
```

The expected arguments are stored as a `list`. A simple way to compare lists for equality is to coerce into a `set`. This discards ordering (which I don't care about) and duplicates (which should not exist) and allows the use of `==`.

_Note: `q_args` is a dictionary, but `set()` only operates on the keys (essentially, `q_args.keys()`), which is the desired behavior in this case._

```
>>> [1,2,3] == [3,2,1]
False
>>> set([1,2,3]) == set([3,2,1])
True
```

Great! Problem solved! Yeah, no. Because I made the design decision (as noted in part 2) to allow the absence of parameters given to the reload function to indicate a desire to keep the existing values, I lack an explicit way to remove arguments. And because I determine which query will run by the presence or absence of arguments, well, you see the problem.

The original design decision had this basis: the ability to specify only the parameters that differ from current widget state is useful because sometimes _only the difference is available_. Meaning, whatever code is requesting the widget reload may only have access to some new value that it would like to see reflected, but not be aware of (or care about) other parameter values. 

A contrived example: Imagine in our current demo if I wanted to write a function to just filter results by an author. If the user had previously filtered by title or year, I would want to respect that and leave those values in place. I want my function to _add_ a parameter to the query, not replace it. Likewise, if the user deleted a filter, I want to remove just that parameter. So it's a useful feature.

So how can I allow for this usage and still provide the option to explicitly clear existing parameters when required? Perhaps a third argument to the `reloadDynamicWidget()` function?

`const reloadDynamicWidget = (name, argObj, clearArgs=false) => { ... }`

Note the new third argument, with a default value. [Default parameters](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Default_parameters) were added in ES2015 and are well supported by all browsers. I've set the default value to `false` here because I want to leave the existing behavior (additive changes to parameters) as the ... default.

That function is just a wrapper for the dynamic widget's `reloadContents()` method, so that's where I will actually add the functionality.

```
async reloadContents(argObj, clearArgs) {
    if (clearArgs === true) {
      for (let k in this.dataset) {
        delete this.dataset[k];
      }
    }
    ...
}
```

### Problem 2: The Shadow DOM...

The [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM) is a key part of encapsulation in web components. It keeps markup, styles, and Javascript separate from the rest of the page. This is great!

Except for how Javascript contained within the dynamic widget template is parsed and added to the `Window` scope via `document.createElement('script')`. Despite the fact that I am appending this created element _to the shadow DOM root_, it is still executing in the global scope:

```
<script>
  console.log(this)
</script>

...

> Window 
```

This [appears to be](https://github.com/whatwg/html/issues/5754) known behavior.

Now the JS contained within my template no longer has a reference to the shadow DOM in which it's written. In the case of my demo, I want to conditionally create a button to clear the search criteria filtering. Because the button is conditionally displayed (i.e. it's only there when filtering is active) I wanted it to be contained within the dynamic widget, which is aware of its state. But I can't even add an event listener to the button, because that JS will be executed in the `Window` scope, _which can't see the button inside the shadow DOM!_

It's a mess, and it's poor design.

A number of options come to mind:

1. Move the button outside the dynamic widget. This ensures it's operating in the correct scope, but this also means the button will need to be permanently displayed because it cannot be aware of the state inside the widget (e.g. whether it is in search mode). Perhaps this is fine. The button just won't do anything but refresh the widget to the existing state if pressed when there is no filtering. But it's not great interface design.
2. Create and update a global object containing references to all the shadow DOMs in all the dynamic widgets in the page. This is a technically appealing solution, because ... OBJECTS! CODE! REFERENCES! ... but I'm not convinced it's the best idea yet.

So that I can wrap all this up, I'm going with option #1 for now. But this is an issue that will need resolution at some point. 

I am suddenly reminded of a quote from [this Fireship video](https://www.youtube.com/watch?v=cuHDQhDhvPE) (emphasis mine):

> About once a year a hot take will go viral saying that you don't need a Javascript framework at all. Any expert web developer needs to have a solid understanding of vanilla JS, but even if you're a Javascript god, attempting to build a non-trivial app with it is a recipe for disaster. **What you'll end up doing is building your own shitty Javascript framework, and the last thing the world needs is another Javascript framework.**

### The final demo

... can be found here: https://github.com/bchandos/web-component

### Lessons and next steps

To be honest, it doesn't feel like much has been accomplished here. I've just created a basic web component that has some methods to reload its contents from the server. Ultimately, this is not very useful as a standalone project, and I doubt I'll be utilizing it elsewhere. However, I did learn some things about native web components and the shadow DOM. I think parsing SQL from the template comments was ... a novel solution, and working through the various challenges was a useful exercise.

But really, this is not a great idea. Or even a good one. That is sometimes the inevitable result of experimentation, and I just hope that I've learned enough to recognize design flaws earlier in the process.