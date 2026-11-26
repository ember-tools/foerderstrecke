import {createRouter, type RouteRecordRaw, type RouterHistory} from 'vue-router'

const routes: RouteRecordRaw[] = [
    {path: '/', name: 'Landing', component: () => import('../views/LandingView.vue'), meta: {public: true}},
    {path: '/planer', name: 'Planner', component: () => import('../views/PlannerView.vue'),
        meta: {titleKey: 'routes.planner'}},
    {path: '/lernen', name: 'Learn', component: () => import('../views/LearnView.vue'),
        meta: {titleKey: 'routes.learn'}},
    {path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundView.vue'),
        meta: {titleKey: 'routes.notFound'}},
]

/** The tool's router, with web history in the browser and memory history when prerendering. */
export function createAppRouter(history: RouterHistory) {
    return createRouter({history, routes})
}
