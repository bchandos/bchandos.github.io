---
layout: post
published-on: 15 Jan 2022 20:00:00 GMT
title: Adding a controller for the dynamic web component
author: Bill Chandos
description: Join me again as I continue creating a generic web component that can load and refresh dynamic contents from the backend.
tags: python,javascript,web-components,html,aiosql,jinja,jinja2,bottle
---

## Creating a self-contained dynamic web component, part 2

In [part 1 of this series](/blog/create_a_self-contained_dynamic.html), I began developing a web component called a "dynamic widget" that can load and reload its contents asynchronously from the backend. Be sure to read the introduction to understand the motivation for such a design, but suffice to say there are advantages to keeping data definitions and presentation logic coupled from a developer ergonomics perspective.

### Continuing on...

When last we left our widget, it was capable of doing initial load from the server ... and not much else. Actually, it can't do anything at all: the server doesn't even exist yet! I will quickly implement the reload method, which I can do because it primarily relies on the `_loadContents()` method created in part 1. There is only one additional step: when reloading, we very frequently want to make modifications to the parameters we send to the server. This could be filtering parameters on a list of items, state information, or just general context so the server knows how to query data and return results.

```
  async reloadContents(argObj) {
    for (let k of Object.getOwnPropertyNames(argObj)) {
      this.dataset[k] = argObj[k];
    }
    await this._loadContents();
  }
```

`reloadContents(argObj)` accepts `argObj` which is ... an object filled with arguments. They must be key-value pairs, and I will want to enforce that soon. The `_loadContents()` method already processes the elements' `dataset` so I can simply add these arguments as `data-` attributes. Note here that this code will not overwrite existing `data-` attributes if that key is not explicitly included in `argObjs`. This ensures that I only need to pass in values I want to change and initial values will remain.

There's not much left to the dynamic widget code itself except for some visual niceities which I'll return to.

### Welcome to the Server Side

I setup a [bottle.py](https://bottlepy.org/docs/dev/) server for simplicity, although bottle is the basis for Flask so it may look familiar. I will leave the boilerplate code for you to review in the repo, but the route we are concerned with here is `/dynamic-widget` which accepts all requests for dynamic widget content and returns JSON that includes the rendered template as HTML/CSS/JS.

```
@app.get('/dynamic-widget')
def dynamic_widget():
    args = request.params
    filename = f'{args["name"]}.html'
    results = load_sql_from_template(filename, **args)
    template = env.get_template(filename)
    newBody = template.render(**results, **args)
    
    return json.dumps({
        'newBody': newBody,
    })
```

The first job is the collect the arguments. The filename of the template is derived from the `name` argument, with `.html` appended. Of course, if my widget templates were stored in another part of the filesystem and/or used a different extension, that would all be setup here. I could even look up the canonical filepath in a database or elsewhere using a function.

`load_sql_from_template()` is where things start to get interesting. I am passing in the filename and all remaining arguments (using Python's `**` to convert a dictionary into keyword arguments). This returns something we're calling `results` and although this Python code is not typed, you can see that I am expecting a dictionary back, as I again use `**` to pass these results to the template's `render()` method, along with all other arguments for good measure. That method returns a string of HTML/CSS/JS that I then return as JSON.

In part 1 I mentioned that, although I'd like this pattern to work with every back-end and template language, there are limitations. Well `load_sql_from_template()` is where those limitations are first encountered. However, clever programmers can likely devise their own (likely better!) solutions. The Jinja templating language cannot execute arbitrary Python code of the type that would be needed to (for example) retrieve data from a database or an ORM for its own use. But our stated goal is to include the data retrieval logic with the presentation logic so the dynamic widget is, essentially, self-contained.

I was thinking about this problem, when I recalled a project I heard about via the [Python Bytes](https://pythonbytes.fm/episodes/show/237/separate-your-sql-and-python-asynchronously-with-aiosql) podcast called [`aiosql`](https://nackjicholson.github.io/aiosql/). This library parses an SQL file to retrieve your queries and then lets you execute them via convenient method calls. One of the advantages of `aiosql` is keeping SQL out of your source code for ease of maintenance.

The system works by using a comment field above the query with a specific syntax to determine a) what to call the query; b) what it is intended to do (i.e. return a single item, select a single value, etc.). You can read all about it in the quality documentation.

I'll not belabor this any longer: I am going to place queries written in this format in the comments section of the Jinja template, retrieve them by parsing the file, execute them with `aiosql` and pass the results to the template rendering engine.

The format for the query comments needs to be easily identifiable. I have arbitrarily decided that all queries will be contained in a single comment block (denoted in Jinja by `{# ... #}`) and the comment opening line must contain the string "queries:"

```
def load_sql_from_template(template, **kwargs):
    """ Load aiosql-formatted comment block from Jinja template file """
    sql_block = list()
    with open(template, 'r') as t:
        for l in t.readlines():
            if ('{#' in l and 'queries:' in l) or l == '\n':
                continue
            if '#}' in l:
                break
            sql_block.append(l.strip())
    ...
```

This is a bit rough, but it works. It would be convenient if the Jinja parser would expose comment blocks somehow, but instead I'll just parse the file as text. This code will take every line between the opening and closing comment delimiters and add them to a list. (I can likely rewrite this using regular expressions, but that will be a job for another day.)

Thankfully, `aiosql` is happy to parse queries from a string:
```
    queries = aiosql.from_str('\n'.join(sql_block), 'sqlite3')
```

But I'm not ready to run these queries yet. These widgets are dynamic, meaning the underlying data is dynamic, meaning I am very likely to need to pass an argument (or several) to the query. `aiosql` can handle this by including `:argument_name` in the query, but we need to find those arguments and pass them when executing the function. I _also_ need to provide a variable name where the query's results will be stored to pass to the template renderer. To keep this all self-contained, I have defined my own SQL comments to include in the query definition. The library expects `name:`, but you can add any amount of comments under this and `aiosql` will parse them and conveniently add them to the docstring for the query object.

```
    results = dict()
    for q in [x for x in queries.available_queries if '_cursor' not in x]:
        q_ = getattr(queries, q)
        comments = q_.__doc__.split('\n')
```

After initializing the results dictionary, I iterate over the parsed queries. These are stored in the `available_queries` property of `queries`, although as strings, and with a matching `<query_name>_cursor` entry. The list comprehension filters those, and in the first line of the loop I retrieve the actual query object itself using `get_attr`. With that, I can grab the docstring using the `__doc__` property, and split it on newlines.

```
        for comment in comments:
            if 'args:' in comment:
                expected_args = json.loads(comment.split(':')[1].strip())
            elif 'key:' in comment:
                key = comment.split(':')[1].strip()
```

Now to iterate over those extracted comments looking for my specially named entries. These are lines that begin with "args:" and "key:". `args` should be a string representation of a Javascript array so that it can be parsed by `json.loads()`. `key` should be a string. Some basic string manipulation to separate out the actual values, and I am ready to actually run the query. Well, almost ...

```
        q_args = {k: v for k, v in kwargs.items() if k in expected_args}
```

So as not to pass every argument provided to the controller, I filter the dictionary (using a dictionary comprehension) to only include those the query expects.

_Now_ I can execute the query, providing the expected arguments, and storing the result in the results dictionary using the key.

```
        result = q_(conn, **q_args)
        results[key] = result
    return results
```

Whew! That was a lot to get through, but to summarize:
 - Query definitions are stored in a specially formatted comment block at the top of the dyanmic widget's template file;
 - The queries are parsed by `aiosql`;
 - Additional _query_ comments are parsed to find argument names and the name of the key the template expects;
 - The queries are executed and the results returned to the controller, which immediately passes them to the template renderer;
 - The rendered template contents are sent back to the dynamic widget as JSON.

### Lessons and next steps

Much is missing right now, including data validation or any error handling. (What happens, for example, if the expected query arguments are not passed to the controller?) But this post is getting too long, so I'll save that - plus those visual niceities, and a working example - for part 3.