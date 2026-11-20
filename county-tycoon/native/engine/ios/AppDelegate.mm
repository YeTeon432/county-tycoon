/****************************************************************************
 Copyright (c) 2010-2013 cocos2d-x.org
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2022 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
****************************************************************************/

#import "AppDelegate.h"
#import "ViewController.h"
#import "View.h"

#include "platform/ios/IOSPlatform.h"
#import "platform/ios/AppDelegateBridge.h"
#import "service/SDKWrapper.h"

@interface CountySceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@interface AppDelegate ()
@property(nonatomic) BOOL gameStarted;
- (UIWindow *)startGameInScene:(UIWindowScene *)scene;
@end

@implementation AppDelegate
@synthesize window;
@synthesize appDelegateBridge;

#pragma mark -
#pragma mark Application lifecycle

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    [[SDKWrapper shared] application:application didFinishLaunchingWithOptions:launchOptions];
    appDelegateBridge = [[AppDelegateBridge alloc] init];
    return YES;
}

- (UISceneConfiguration *)application:(UIApplication *)application
 configurationForConnectingSceneSession:(UISceneSession *)session
                              options:(UISceneConnectionOptions *)options {
    UISceneConfiguration *configuration =
        [[UISceneConfiguration alloc] initWithName:@"County Game" sessionRole:session.role];
    configuration.delegateClass = [CountySceneDelegate class];
    return configuration;
}

- (UIWindow *)startGameInScene:(UIWindowScene *)scene {
    if (!_viewController) {
        _viewController = [[ViewController alloc] init];
        _viewController.view = [[View alloc] initWithFrame:scene.coordinateSpace.bounds];
        _viewController.view.contentScaleFactor = scene.screen.scale;
        _viewController.view.multipleTouchEnabled = YES;
    }
    // Cocos 3.8 的系统窗口和安全区从 AppDelegate.window 取视图。
    self.window = [[UIWindow alloc] initWithWindowScene:scene];
    self.window.rootViewController = _viewController;
    [self.window makeKeyAndVisible];
    if (!self.gameStarted) {
        [appDelegateBridge application:UIApplication.sharedApplication didFinishLaunchingWithOptions:nil];
        self.gameStarted = YES;
    }
    return self.window;
}

- (void)applicationWillTerminate:(UIApplication *)application {
    [[SDKWrapper shared] applicationWillTerminate:application];
    if (self.gameStarted) [appDelegateBridge applicationWillTerminate:application];
}

#pragma mark -
#pragma mark Memory management

- (void)applicationDidReceiveMemoryWarning:(UIApplication *)application {
    [[SDKWrapper shared] applicationDidReceiveMemoryWarning:application];
}

@end

@implementation CountySceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session
       options:(UISceneConnectionOptions *)options {
    if (![scene isKindOfClass:UIWindowScene.class]) return;
    AppDelegate *delegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    self.window = [delegate startGameInScene:(UIWindowScene *)scene];
}

- (void)sceneWillResignActive:(UIScene *)scene {
    UIApplication *application = UIApplication.sharedApplication;
    AppDelegate *delegate = (AppDelegate *)application.delegate;
    [[SDKWrapper shared] applicationWillResignActive:application];
    if (delegate.gameStarted) [delegate.appDelegateBridge applicationWillResignActive:application];
}

- (void)sceneDidBecomeActive:(UIScene *)scene {
    UIApplication *application = UIApplication.sharedApplication;
    AppDelegate *delegate = (AppDelegate *)application.delegate;
    [[SDKWrapper shared] applicationDidBecomeActive:application];
    if (delegate.gameStarted) [delegate.appDelegateBridge applicationDidBecomeActive:application];
}

- (void)sceneDidEnterBackground:(UIScene *)scene {
    [[SDKWrapper shared] applicationDidEnterBackground:UIApplication.sharedApplication];
}

- (void)sceneWillEnterForeground:(UIScene *)scene {
    [[SDKWrapper shared] applicationWillEnterForeground:UIApplication.sharedApplication];
}

@end
