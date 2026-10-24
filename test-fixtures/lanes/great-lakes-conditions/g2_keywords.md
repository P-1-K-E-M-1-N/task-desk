# G2 demand test: Great Lakes Conditions (traffic lane)

Written 2026-10-24. Three parts: (a) the 40 queries, (b) exact Keyword Planner steps for Nick, (c) competitor audit.

## (a) 40 candidate search queries

Mix of location x metric, lake x metric, and intent phrases. Copy the block between the lines straight into Keyword Planner.

```
lake michigan wave forecast grand haven
grand haven wave height today
holland michigan lake conditions today
holland state park waves today
lake michigan water temperature holland mi
lake michigan water temp today
lake michigan water temperature st joseph
south haven lake michigan waves
saugatuck lake michigan water temperature
muskegon lake michigan conditions
ludington lake michigan waves
frankfort michigan lake conditions
traverse city bay water temperature
grand traverse bay wind forecast
lake huron water temperature today
lake huron wave forecast
port huron lake conditions
harbor beach michigan lake conditions
saginaw bay fishing conditions
saginaw bay wind waves today
tawas bay water temperature
lake st clair boating conditions
lake st clair wave height
lake st clair water temperature
lake erie michigan boating conditions
lake superior water temperature marquette
lake superior wave forecast
munising lake superior conditions
whitefish bay lake superior waves
lake michigan water level today
great lakes water levels 2027
lake huron water level today
lake superior water level
small craft advisory lake michigan today
lake michigan marine forecast
lake huron marine forecast
lake michigan buoy data
lake michigan rip current forecast today
michigan boat launch conditions
is lake michigan safe to swim today
```

Why these: the first 14 are the busy west-coast harbors (every one has a CO-OPS gauge, shore station or buoy
within a few miles); 15-25 cover Huron, Saginaw Bay and St Clair (big boating/fishing populations near Detroit);
26-29 Superior; 30-33 water level (year-round interest, drives news coverage); 34-40 intent phrases that signal
someone is deciding whether to go out today. Suggest Nick also add 3-5 personal favorites (his own launch, a
family cottage lake) so the list reflects real use.

## (b) Exact steps for Nick: Google Keyword Planner (free, no campaign, no spend)

1. Go to https://ads.google.com and sign in with any Google account. If you have never used Google Ads, click
   **New Google Ads account** and when it asks for a campaign, click the small **"Switch to Expert Mode"** link
   (bottom), then **"Create an account without a campaign"**. Confirm country/timezone/currency (USD). Do not add a
   payment method; Keyword Planner works without one.
2. In the left menu (or top toolbar) click **Tools** (wrench icon) > **Planning** > **Keyword Planner**.
3. Click the right-hand card **"Get search volume and forecasts"** (NOT "Discover new keywords").
4. Paste the 40 lines from the box above (one query per line). Click **Get started**.
5. At the top of the results page set the filters:
   - **Location:** click the location, remove "United States", type **Michigan** and pick "Michigan, United States".
     (Also note the US-wide number afterwards if you have time: change location back to United States and re-export
     as `keyword_volumes_us.csv`. Lake Michigan queries get a lot of Chicago/Wisconsin traffic we could also serve.)
   - **Language:** English. **Search networks:** Google. **Date range:** last 12 months (default is fine).
6. Click the **Historical Metrics** tab (top of the table). The columns we want are
   *Avg. monthly searches*, *Three month change*, *YoY change*, *Competition*, *Top of page bid (low range)*,
   *Top of page bid (high range)*.
   Tip: new accounts with zero spend sometimes see ranges like "1K-10K" instead of exact numbers. That is still
   useful; record the range.
7. Click the **download icon** (top right of the table) > **Plan historical metrics (.csv)**. Save it.
8. Open the CSV. Copy the columns into
   `lanes/great-lakes-conditions/data/keyword_volumes.csv` using the header already in that file:
   `query,avg_monthly_searches,three_month_change,yoy_change,competition,top_bid_low,top_bid_high`
   (or just overwrite the file with Google's CSV; the loader looks for a column that starts with "Keyword" and one
   that starts with "Avg. monthly").
9. Bonus (5 min): on the same screen click the little bar-chart icon next to any query to see the monthly
   breakdown. Screenshot one Lake Michigan query so we can see the May-Sep seasonality. Drop it in `data/`.
10. Run `python lanes/great-lakes-conditions/load_volumes.py` to get a summary, then tell the next agent to
    finish G3.

What we are looking for: total Michigan-only volume across the 40 queries. Rough yardsticks for a page-per-location
site: under 5,000/month total = weak; 5,000-30,000 = viable niche; over 30,000 = strong.

## (c) Competitor audit: top results for 10 queries

Method: web search run on 2026-10-24 via the agent's search tool (not a logged-in Google SERP, so ranking is
approximate; Nick's own incognito Google check would be a good 10-minute sanity test). "Fresh" = does the page show
a timestamped current reading.

| # | Query | Top results (site: what it shows) | Fresh? | Ads / affiliate | Mobile |
|---|---|---|---|---|---|
| 1 | lake michigan wave forecast grand haven | 1. surf-forecast.com (surfer swell model, 6-day); 2. fox17online.com (news story, waves this weekend); 3. michiganpublic.org (2015 story); 4. tgftp.nws.noaa.gov LMZ846 raw text; 5. wgrd.com / woodtv.com (news, webcam) | surf-forecast yes; NWS raw yes; news no (undated/old) | surf-forecast heavy ads; TV sites heavy ads | surf-forecast cluttered; NWS raw text is unformatted; news OK |
| 2 | lake huron water temperature today | 1. lakemonster.com (one temp, seemed months old); 2. seatemperature.net (modelled temp, July chart); 3. omniafishing.com x3 (tackle shop, "current conditions" with conflicting 52/57/64 F); 4. wgrt.com (May news); 5. spam domain | Conflicting and mostly stale | Omnia is an e-commerce funnel; lakemonster ads | Mixed |
| 3 | holland michigan lake conditions today | 1-2. two spam blog clones "Lake Michigan Water Temp Today: Holland"; 3. theweathernetwork.com beach page (air temp only, no waves/water); 4. fox17online.com (red-flag story, undated); 5. whtc.com (2015 stories) | Weather Network partially; rest no | Weather Network ads; spam pages ads | Weather Network good; spam poor |
| 4 | lake michigan water level today vs average | 1. cbsnews.com (old story); 2-3. glisa.umich.edu (climatology tables, 1972-2021); 4. fox11online.com (2022 story); 5. canada.ca LEVELnews (March 2022 PDF-style) | None current | News ads | GLISA fine, dense |
| 5 | small craft advisory lake michigan today | 1-3. record-eagle.com pages carrying NWS advisory text (undated); 4. mesonet.agron.iastate.edu raw 2021 text; 5. wunderground.com severe pages (Chicago, generic) | Only Wunderground is live, and it is not Lake-Michigan specific | Record-Eagle paywall + ads; Wunderground heavy ads | Poor to fair |
| 6 | lake superior buoy data marquette | 1-3. wnmufm.org (news about buoy deployments 2022-2025); 4. weather.gov/mqt/NMU_buoys (static explainer); 5. superiorwatersheds.org (seasonal buoy page, "retrieved for winter") | SWP page shows last reading when deployed; nothing now | Low | Fair |
| 7 | lake st clair boating conditions wind waves | 1-5. spam/SEO content farms on hijacked domains (cohorted.co.uk, lucee.org, rcflood.gov, welcu.com) with generic "conditions change fast" text; patch.com gale story | None | Content farms | Poor |
| 8 | saginaw bay fishing conditions wind waves water temp | 1-3. windy.app fishing-spot pages (model wind, "biting score"); 4-5. aggregator copies of a 2024 Saginaw River fishing report; lakemonster winter report | Windy model yes; no observed water temp | windy.app app-install funnel | Windy fine |
| 9 | traverse city bay water temperature | 1. traverseticker.com (local news, quotes 50 F and the nearest buoys); 2. spam "ucar.edu" page; 3-4. 2020 AP story; 5. mynorth.com (2016/2018 lifestyle) | Ticker is dated snapshot only | Low | Fair |
| 10 | st joseph michigan beach conditions waves rip current today | 1. wunderground.com severe page; 2. abc57.com (beach hazard story); 3. 953mnc.com (2019); 4. ndbc.noaa.gov FZUS53.KIWX raw marine forecast (says "water temperature at St. Joseph is 59 degrees"); 5. marine.weather.gov LMZ046 zone page | NWS pages yes (raw); news no | TV/Wunderground ads | NWS raw text poor on phones |

**Recurring incumbents:** NWS/NOAA raw pages (authoritative, ugly, one metric per page, no "vs normal"),
Wunderground/Weather Network (generic weather, no waves or water level), windy.app and surf-forecast.com (model
forecasts for sailors/surfers, no observations, no water level, no advisories), lakemonster.com and seatemperature.net
(single modelled temperature, often stale), Omnia Fishing (commerce), and a thick layer of undated local-TV stories and
outright spam. GLOS Seagull is the best data UI but ranks for nothing above and is aimed at researchers.

**The gap we would fill:** one page per named place (harbor, launch, beach) that answers "can I go out today?" in
one screen: observed waves + the NWS wave forecast side by side, wind, nearshore and lake-wide water temperature with
"vs normal", water level vs long-term average, and any active advisory, each line timestamped and sourced, mobile
first, rebuilt hourly from public-domain feeds. Nobody in the top results does more than one of those, and most of
the pages ranking for "today" queries are not from today. Seasonality is the honest weakness: buoys are out Nov-Apr,
so winter pages lean on forecasts, shore stations and water level.
