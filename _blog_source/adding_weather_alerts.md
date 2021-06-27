---
layout: post
published-on: 27 Jun 2021 00:00:00 GMT
title: Adding Weather Alerts to Vue App using Public API
author: Bill Chandos
description: Join me as I modify my basic weather application by adding weather alerts from the National Weather Service API
tags: vue,tailwind,tailwindcss,api,weather,spa
---

## Adding Weather Alerts to Basic Weather App Using Public API

### Background

About 9 months ago, I put together a basic weather application that I titled [Dope Weather](https://github.com/bchandos/dope-weather), because I am eleven years old. To be clear, the world does not need another weather app, but I am a proponent of building projects you will actually use as a way to spur and reinforce learning. In this case, my goal was to gain experience with:
 - [VueJS 3's composition API](https://v3.vuejs.org/api/composition-api.html)
 - [Vite as a development and build tool](https://vitejs.dev/guide/)
 - [TailwindCSS](https://tailwindcss.com/)
 - Consuming public APIs
   - [NWS](https://www.weather.gov/documentation/services-web-api)
   - [US Zip Codes - opendatasoft](https://public.opendatasoft.com/explore/dataset/georef-united-states-of-america-zc-point/information/nn)
 - Deployment to public host

And it works! I've been using the app regularly as an interface to NWS weather data and, because of that, have continued working on and updating the project as I've required new features or discovered errors.

*Note: I fully awknowledge that the tools listed above are overkill for a weather app. Again, the exercise is learning.*

There's more that I'd like to do, but as we're experiencing an extreme heatwave in the Pacific Northwest this weekend, adding weather alerts to the app seems an appropriate task for today.

### First steps

The app already has a well-defined structure, and while it may not be how I would architect it today, I'm in no mood for a refactor so I'm going to just graft this feature on where needed.

Something that I like about Vue is the ability to use a standard Javascript file for basic state management. No additional library needed (although they are available), just a [`reactive`](https://v3.vuejs.org/api/basic-reactivity.html#reactive) object that can be imported in components as needed. This is great for bridging the gap from pure stateless apps to stateful apps without the added complexity of a fully-featured state library.

Currently, [my state object](https://github.com/bchandos/dope-weather/blob/main/src/store.js) contains information about the currently selected weather location, some basic user settings, and functions to read/write cookies and local storage.

The National Weather Service has pretty decent API documentation, although one frustration I have with the service is the seemingly arbitrary number of methods by which to identify a location from which to query data. There are zones, regions, areas, stations, offices, points (latitude/longitude), and grid coordinates within a forecast zone. In order to get weather for a ZIP code, the app queries a public API to get latitude and longitude for the ZIP code, then queries NWS for information about that lat/long, including the grid ID and coordinates, which are then used to query NWS and get the forecast data for that grid location. Luckily, some of this data is stored in local storage so - theoretically - only the last request needs to run frequently.

Adding to this complexity, weather alerts are queried by zone, area, or region, and I have none of this data currently stored. Looking at the data returned from the latitude/longitude query (you can test the API [here](https://www.weather.gov/documentation/services-web-api#/default/get_points__point_)) the only one of those 3 I can access is ZoneID, and even that is buried in a URL that will need to be parsed. But at least it's doable.

So I'll need to update the `lookupZip()` function, which lives in the [`ZipCodeInput.vue`](https://github.com/bchandos/dope-weather/blob/main/src/components/ZipCodeInput.vue) component, to parse that value and add it to current state. I'll also modify the `addToHistory()` function to store this value in local storage along with the rest of the relevant data.

```
const forecastZone = weatherJson.properties.forecastZone.split('/');
...
store.zoneId = forecastZone[forecastZone.length - 1];
...
store.addToHistory(zip, store.wfo, store.x, store.y, city, state, store.zoneId);
```

There are many places to set and read the new `zoneId` value - you can see them all in [the commit](https://github.com/bchandos/dope-weather/commit/903c9cd2cb273beb148f77be270fafdaedadbeb1).

Here, though, is where the work is actually done.

```
const alerts = ref([]);
...
const getAlerts = async () => {
    const url = `${store.baseURL}/alerts/active/zone/${store.zoneId}`;
    const response = await fetch(url, {mode: 'cors'});
    const json = await response.json()
    try { 
        alerts.value = json.features;
    } catch(err) {
        alerts.value = [];
    }
}
```

And in the template section:

```
<div v-for="alert in alerts" :key="alert.id" class="flex justify-between flex-wrap items-center bg-red-300 px-4 py-4 my-2 rounded-md shadow-md">
    <h3 class="font-semibold text-center">
        <img src="../assets/icons/warning.svg" alt="warning" class="w-6 h-6 inline">
        {{ alert.properties.parameters.NWSheadline[0] }}
    </h3>
</div>
```

Now, if there are alerts, we will see the headline at the top of the daily forecast. (The headline is an array, although I'm not sure under what circumstances there would be multiple elements. I will assume for now the first element is most relevant.) The warning is not expandable or dismissable, nor do I distinguish between watches and warnings (measures of severity).

### Lessons and next steps

Public APIs are amazing for providing useful and dynamic data around which you can build your applications. But their design choices can leave something to be desired. I'm sure there is an internal consistency to NWS' API design, but as an outsider just trying to get some basic forecast data, there are sometimes confusing hoops to jump through to arrive at the query data needed.

Next up, I will make the alert panel interactive and perhaps add indicators to the individual daily forecast panels that they occur during an alert.